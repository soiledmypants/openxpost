import { statusUrl } from "../pay/types";
import { requireXAuth } from "./env";
import { getStore, type OauthRecord } from "./store";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWEET_URL = "https://api.x.com/2/tweets";

function expiryFromAccessToken(token: string): number {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return 0;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const body = JSON.parse(json) as { exp?: number };
    return typeof body.exp === "number" ? body.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function loadOauth(): Promise<OauthRecord> {
  const env = requireXAuth();
  const stored = await (await getStore()).getOauth();
  if (stored?.accessToken && stored.refreshToken) {
    return stored;
  }
  return {
    accessToken: env.accessToken,
    refreshToken: env.refreshToken,
    expiresAt: expiryFromAccessToken(env.accessToken),
  };
}

async function refreshOauth(current: OauthRecord): Promise<OauthRecord> {
  const { clientId, clientSecret } = requireXAuth();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
    client_id: clientId,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? `X token refresh failed (${response.status}).`,
    );
  }
  const next: OauthRecord = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? current.refreshToken,
    expiresAt:
      typeof json.expires_in === "number"
        ? Date.now() + json.expires_in * 1000
        : expiryFromAccessToken(json.access_token),
  };
  await (await getStore()).putOauth(next);
  return next;
}

async function bearer(): Promise<string> {
  let tokens = await loadOauth();
  if (!tokens.expiresAt || tokens.expiresAt < Date.now() + 60_000) {
    tokens = await refreshOauth(tokens);
  }
  return tokens.accessToken;
}

type TweetApi = {
  data?: { id?: string; text?: string };
  title?: string;
  detail?: string;
  errors?: { message?: string }[];
};

async function createTweet(accessToken: string, text: string): Promise<Response> {
  return fetch(TWEET_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
}

async function destroyTweet(accessToken: string, tweetId: string): Promise<Response> {
  return fetch(`${TWEET_URL}/${encodeURIComponent(tweetId)}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

function tweetApiError(json: TweetApi, status: number): Error {
  const fromErrors = json.errors?.map((item) => item.message).filter(Boolean).join(" ");
  return new Error(json.detail ?? json.title ?? fromErrors ?? `X API ${status}.`);
}

export async function postTweetText(text: string): Promise<{ tweetId: string; tweetUrl: string }> {
  let token = await bearer();
  let response = await createTweet(token, text);
  if (response.status === 401) {
    const refreshed = await refreshOauth(await loadOauth());
    token = refreshed.accessToken;
    response = await createTweet(token, text);
  }

  const json = (await response.json()) as TweetApi;
  if (!response.ok) {
    const fromErrors = json.errors?.map((item) => item.message).filter(Boolean).join(" ");
    throw new Error(
      json.detail ?? json.title ?? fromErrors ?? `X API ${response.status}. Payment is kept; retry the post.`,
    );
  }
  const tweetId = json.data?.id;
  if (!tweetId) {
    throw new Error("X API returned no tweet id. Payment is kept; retry the post.");
  }
  return { tweetId, tweetUrl: statusUrl(tweetId) };
}

/** DELETE https://api.x.com/2/tweets/:id. 404 (already gone) is success. Same OAuth as postTweetText. */
export async function deleteTweet(tweetId: string): Promise<void> {
  const id = tweetId.trim();
  if (!id) {
    throw new Error("tweetId is required.");
  }

  let token = await bearer();
  let response = await destroyTweet(token, id);
  if (response.status === 401) {
    const refreshed = await refreshOauth(await loadOauth());
    token = refreshed.accessToken;
    response = await destroyTweet(token, id);
  }
  if (response.ok || response.status === 404) {
    return;
  }

  let json: TweetApi = {};
  try {
    json = (await response.json()) as TweetApi;
  } catch {
    json = {};
  }
  throw tweetApiError(json, response.status);
}
