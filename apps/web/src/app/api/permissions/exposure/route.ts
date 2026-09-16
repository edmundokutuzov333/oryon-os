import { proxyPermissionRequest } from "../_lib";

export async function GET(request: Request) {
	return proxyPermissionRequest(request, "/v1/permissions/exposure", false);
}
