import { PrismaClient } from "./generated/client.js";

export const ORYON_DB_VERSION = "0.1.0" as const;

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
	prisma ??= new PrismaClient();
	return prisma;
}

export async function closePrisma(): Promise<void> {
	if (prisma !== undefined) {
		await prisma.$disconnect();
		prisma = undefined;
	}
}
