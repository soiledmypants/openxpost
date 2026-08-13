import { serve } from "../../server/serve";

export default async (req: Request): Promise<Response> => serve(req, "invoice");
