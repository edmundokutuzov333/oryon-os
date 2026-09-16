import { proxyPermissionRequest } from "../_lib";

export async function POST(request: Request) {
	return proxyPermissionRequest(request, "/v1/permissions/evaluate");
}
