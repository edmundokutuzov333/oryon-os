import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/db/prisma/schema.prisma";
let source = readFileSync(path, "utf8");

source = source.replace(
	/^enum ([A-Za-z_][A-Za-z0-9_]*) \{ ([^{}\n]+) \}$/gm,
	(_match, name, values) => {
		const members = values
			.trim()
			.split(/\s+/)
			.map((value) => `\t${value}`)
			.join("\n");
		return `enum ${name} {\n${members}\n}`;
	},
);

const organizationRelations = [
	"edges Edge[]",
	"attachments Attachment[]",
	"timeEntries TimeEntry[]",
	"channelMembers ChannelMember[]",
	"messages Message[]",
	"reactions Reaction[]",
	"emailAccounts EmailAccount[]",
	"emailThreads EmailThread[]",
	"meetingParticipants MeetingParticipant[]",
	"meetingArtifacts MeetingArtifact[]",
	"rooms Room[]",
	"pageVersions PageVersion[]",
	"dataRecords DataRecord[]",
	"savedViews SavedView[]",
	"workflowRuns WorkflowRun[]",
];
const missingOrganizationRelations = organizationRelations.filter(
	(relation) => !source.includes(`\n  ${relation}`),
);
if (missingOrganizationRelations.length > 0) {
	const anchor = "  meetings   Meeting[]\n";
	if (!source.includes(anchor))
		throw new Error("Organization relation anchor not found");
	source = source.replace(
		anchor,
		`${anchor}${missingOrganizationRelations.map((relation) => `  ${relation}\n`).join("")}`,
	);
}

const userRelations = [
	"timeEntries TimeEntry[]",
	"channelMembers ChannelMember[]",
	"reactions Reaction[]",
	"meetingParticipants MeetingParticipant[]",
	"notifications Notification[]",
];
const missingUserRelations = userRelations.filter(
	(relation) => !source.includes(`\n  ${relation}`),
);
if (missingUserRelations.length > 0) {
	const anchor = "  auditLogs AuditLog[]\n";
	if (!source.includes(anchor))
		throw new Error("User relation anchor not found");
	source = source.replace(
		anchor,
		`${anchor}${missingUserRelations.map((relation) => `  ${relation}\n`).join("")}`,
	);
}

writeFileSync(path, source);
execFileSync(
	"pnpm",
	[
		"--filter",
		"@oryon/db",
		"exec",
		"prisma",
		"format",
		"--schema",
		"prisma/schema.prisma",
	],
	{ stdio: "inherit" },
);
console.log(`Normalized Prisma schema syntax and relation metadata in ${path}`);
