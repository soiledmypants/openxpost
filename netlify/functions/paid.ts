import { servePaid } from "../../server/status-http";

export default async (req: Request): Promise<Response> => servePaid(req);
