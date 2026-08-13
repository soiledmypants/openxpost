import { servePost } from "../../server/post";

export default async (req: Request): Promise<Response> => servePost(req);
