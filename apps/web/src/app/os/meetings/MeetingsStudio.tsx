"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeetingSchema, type Meeting, type MeetingArtifactCreateInput } from "@oryon/contracts/meeting";
import { IdentityContextSchema } from "@oryon/contracts/identity";
import { Button, Card, Input, PageHeader, SelectPill, StatusChip, Textarea, type IconButton } from "@oryon/ui";
import { Camera, CameraOff, Check, ChevronLeft, ChevronRight, FileText, Mic, MicOff, MonitorUp, Plus, Radio, Sparkles, Users, Video, X } from "lucide-react";
import { Participant, Room, RoomEvent, Track } from "livekit-client";

const COPY = {
	title: "Meetings",
	description: "Calendário, reuniões e artefactos de trabalho num único espaço.",
	newMeeting: "Nova reunião",
	upcoming: "Próximas reuniões",
	noMeetings: "Não existem reuniões neste período.",
	createTitle: "Criar reunião",
	titleLabel: "Título",
	start: "Início",
	end: "Fim",
	timezone: "Fuso horário",
	room: "Sala",
	agenda: "Agenda",
	save: "Criar reunião",
	cancel: "Cancelar",
	join: "Entrar na reunião",
	startMeeting: "Começar reunião",
	endMeeting: "Terminar reunião",
	cancelMeeting: "Cancelar reunião",
	participants: "Participantes",
	artifacts: "Artefactos",
	notes: "Notas",
	transcript: "Transcrição",
	saveArtifact: "Guardar artefacto",
	convert: "Criar WorkObject",
	live: "Em directo",
	scheduled: "Agendada",
	ended: "Terminada",
	cancelled: "Cancelada",
	rsvp: "RSVP",
	accept: "Aceitar",
	tentative: "Talvez",
	decline: "Recusar",
	close: "Fechar",
	microphone: "Microfone",
	camera: "Câmara",
	shareScreen: "Partilhar ecrã",
	leave: "Sair",
	waiting: "A ligar…",
	connected: "Ligado",
	connectionError: "Não foi possível entrar na chamada.",
};

const PEOPLE_SCHEMA = { parse(value: unknown): Array<{ id: string; name: string; displayName: string | null; email: string }> {
		if (!Array.isArray(value)) throw new Error("INVALID_PEOPLE_RESPONSE");
		return value.map((item) => {
			if (!item || typeof item !== "object") throw new Error("INVALID_PEOPLE_RESPONSE");
			const row = item as Record<string, unknown>;
			if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.email !== "string") throw new Error("INVALID_PEOPLE_RESPONSE");
			return { id: row.id, name: row.name, displayName: typeof row.displayName === "string" ? row.displayName : null, email: row.email };
		});
	},
};

function makeIdempotencyKey(): string { return crypto.randomUUID(); }
async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "Idempotency-Key": makeIdempotencyKey(), ...(init?.headers ?? {}) }, cache: "no-store" });
	const payload = await response.json() as { data?: unknown; error?: { message?: string } };
	if (!response.ok) throw new Error(payload.error?.message ?? "REQUEST_FAILED");
	return payload.data;
}
function startOfWeek(date: Date): Date { const next = new Date(date); const day = next.getDay(); const diff = day === 0 ? -6 : 1 - day; next.setDate(next.getDate() + diff); next.setHours(0, 0, 0, 0); return next; }
function isoForInput(date: Date): string { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function humanDate(date: string, timezone: string): string { return new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "2-digit", month: "short", timeZone: timezone }).format(new Date(date)); }
function humanTime(date: string, timezone: string): string { return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(date)); }
function statusLabel(state: Meeting["state"]): string { return state === "LIVE" ? COPY.live : state === "ENDED" ? COPY.ended : state === "CANCELLED" ? COPY.cancelled : COPY.scheduled; }

function LiveMeeting({ meeting, onClose, onEnded }: { meeting: Meeting; onClose: () => void; onEnded: () => void }) {
	const [state, setState] = useState("idle");
	const [mic, setMic] = useState(true);
	const [camera, setCamera] = useState(true);
	const [screen, setScreen] = useState(false);
	const [participants, setParticipants] = useState<Participant[]>([]);
	const roomRef = useRef<Room | null>(null);
	const mediaRefs = useRef<Record<string, HTMLDivElement | null>>({});

	const refreshParticipants = useCallback(() => {
		const room = roomRef.current;
		if (!room) return;
		setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
	}, []);

	useEffect(() => {
		let active = true;
		const room = new Room({ adaptiveStream: true, dynacast: true });
		roomRef.current = room;
		const sync = () => { if (active) refreshParticipants(); };
		const onSubscribed = (track: Track) => {
			const media = track.attach();
			const participant = track.isLocal ? room.localParticipant : [...room.remoteParticipants.values()].find((candidate) => candidate.getTrackPublications().some((publication) => publication.track === track));
			if (!participant) return;
			const host = mediaRefs.current[participant.identity];
			if (host) host.appendChild(media);
			sync();
		};
		const onUnsubscribed = (track: Track) => { track.detach(); sync(); };
		room.on(RoomEvent.TrackSubscribed, onSubscribed);
		room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
		room.on(RoomEvent.ParticipantConnected, sync);
		room.on(RoomEvent.ParticipantDisconnected, sync);
		room.on(RoomEvent.LocalTrackPublished, sync);
		room.on(RoomEvent.LocalTrackUnpublished, sync);
		room.on(RoomEvent.ActiveSpeakersChanged, sync);
		void (async () => {
			try {
				setState("connecting");
				const data = await requestJson(`/api/meetings/${meeting.id}/join`, { method: "POST", body: "{}" }) as { wsUrl: string; token: string };
				if (!active) return;
				await room.connect(data.wsUrl, data.token);
				if (!active) { room.disconnect(); return; }
				setState("connected");
				await room.localParticipant.enableCameraAndMicrophone();
				refreshParticipants();
			} catch {
				if (active) setState("error");
			}
		})();
		return () => {
			active = false;
			room.removeAllListeners();
			room.disconnect();
			roomRef.current = null;
		};
	}, [meeting.id, refreshParticipants]);

	async function toggleMic() { const room = roomRef.current; if (!room) return; const publication = await room.localParticipant.setMicrophoneEnabled(!mic); setMic(Boolean(publication)); refreshParticipants(); }
	async function toggleCamera() { const room = roomRef.current; if (!room) return; const publication = await room.localParticipant.setCameraEnabled(!camera); setCamera(Boolean(publication)); refreshParticipants(); }
	async function toggleScreen() { const room = roomRef.current; if (!room) return; const publication = await room.localParticipant.setScreenShareEnabled(!screen); setScreen(Boolean(publication)); refreshParticipants(); }
	async function leave() { await requestJson(`/api/meetings/${meeting.id}/leave`, { method: "POST", body: "{}" }).catch(() => undefined); roomRef.current?.disconnect(); onClose(); }
	async function end() { await requestJson(`/api/meetings/${meeting.id}/state`, { method: "POST", body: JSON.stringify({ state: "ENDED" }) }); roomRef.current?.disconnect(); onEnded(); }

	return <div className="oryon-meeting-call">
		<header className="oryon-meeting-call-header"><div><span className="oryon-eyebrow">{state === "connected" ? COPY.connected : COPY.waiting}</span><h2>{meeting.title}</h2></div><div className="oryon-meeting-call-meta"><StatusChip state="neutral">{`${participants.length} ${COPY.participants.toLocaleLowerCase("pt-PT")}`}</StatusChip><Button variant="ghost" size="sm" onClick={onClose}>{COPY.close}</Button></div></header>
		<div className="oryon-meeting-stage">
			{state === "error" ? <Card><div className="oryon-empty-state"><Video size={20} strokeWidth={1.5} /><strong>{COPY.connectionError}</strong><p>{COPY.connectionError}</p></div></Card> : <div className={`oryon-video-grid oryon-video-grid-${Math.min(Math.max(participants.length, 1), 4)}`}>
				{participants.map((participant) => <div className={`oryon-video-tile ${participant.isSpeaking ? "is-speaking" : ""}`} key={participant.identity} ref={(node) => { mediaRefs.current[participant.identity] = node; }}><div className="oryon-video-placeholder"><span className="oryon-avatar oryon-avatar-lg">{(participant.name ?? participant.identity).slice(0, 2).toUpperCase()}</span></div><span className="oryon-video-name">{participant.name ?? participant.identity}</span></div>)}
			</div>}
		</div>
		<footer className="oryon-meeting-controls"><div className="oryon-meeting-control-group"><Button variant={mic ? "secondary" : "danger"} size="md" onClick={() => void toggleMic()} aria-label={COPY.microphone}>{mic ? <Mic size={18} strokeWidth={1.5} /> : <MicOff size={18} strokeWidth={1.5} />}</Button><Button variant={camera ? "secondary" : "danger"} size="md" onClick={() => void toggleCamera()} aria-label={COPY.camera}>{camera ? <Camera size={18} strokeWidth={1.5} /> : <CameraOff size={18} strokeWidth={1.5} />}</Button><Button variant={screen ? "primary" : "secondary"} size="md" onClick={() => void toggleScreen()} aria-label={COPY.shareScreen}><MonitorUp size={18} strokeWidth={1.5} /></Button></div><div className="oryon-meeting-control-group"><Button variant="ghost" onClick={() => void leave()}>{COPY.leave}</Button>{meeting.permissions.manage ? <Button variant="danger" onClick={() => void end()}>{COPY.endMeeting}</Button> : null}</div></footer>
	</div>;
}

function CreateMeeting({ timezone, rooms, onCreated, onCancel }: { timezone: string; rooms: Array<{ id: string; name: string; capacity: number }>; onCreated: (meeting: Meeting) => void; onCancel: () => void }) {
	const [title, setTitle] = useState("");
	const [start, setStart] = useState(isoForInput(new Date(Date.now() + 30 * 60000)));
	const [end, setEnd] = useState(isoForInput(new Date(Date.now() + 90 * 60000)));
	const [agenda, setAgenda] = useState("");
	const [roomId, setRoomId] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function save() {
		try { setSaving(true); setError(null); const created = await requestJson("/api/meetings", { method: "POST", body: JSON.stringify({ title, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), timezone, agenda: agenda.split("\n").map((line) => line.trim()).filter(Boolean), roomId: roomId || null, participantUserIds: [], provider: "ORYON", e2ee: false, aiEnabled: true }) }); onCreated(MeetingSchema.parse(created)); } catch (err) { setError(err instanceof Error ? err.message : "CREATE_FAILED"); } finally { setSaving(false); }
	}
	return <Card><div className="oryon-meeting-form"><div className="oryon-meeting-form-header"><div><span className="oryon-eyebrow">{COPY.newMeeting}</span><h2>{COPY.createTitle}</h2></div><Button variant="ghost" onClick={onCancel}>{COPY.cancel}</Button></div><div className="oryon-form-grid"><Input label={COPY.titleLabel} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={COPY.titleLabel} /><SelectPill label={COPY.room} value={roomId} onChange={(event) => setRoomId(event.target.value)} options={[{ value: "", label: "Sem sala" }, ...rooms.map((room) => ({ value: room.id, label: `${room.name} · ${room.capacity}` }))]} /><Input label={COPY.start} type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /><Input label={COPY.end} type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></div><Textarea label={COPY.agenda} value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder={COPY.agenda} /><div className="oryon-meeting-form-footer">{error ? <span className="oryon-inline-error">{error}</span> : null}<Button variant="primary" loading={saving} disabled={saving || title.trim().length === 0} onClick={() => void save()}>{COPY.save}</Button></div></div></Card>;
}

function MeetingDetail({ meeting, currentUserId, onUpdated, onClose, onJoin }: { meeting: Meeting; currentUserId: string; onUpdated: (meeting: Meeting) => void; onClose: () => void; onJoin: () => void }) {
	const [artifactKind, setArtifactKind] = useState<MeetingArtifactCreateInput["kind"]>("NOTES");
	const [artifactText, setArtifactText] = useState("");
	const [savingArtifact, setSavingArtifact] = useState(false);
	async function changeState(state: "LIVE" | "CANCELLED") { const data = await requestJson(`/api/meetings/${meeting.id}/state`, { method: "POST", body: JSON.stringify({ state }) }); onUpdated(MeetingSchema.parse(data)); }
	async function rsvp(participantId: string, rsvpValue: "ACCEPTED" | "TENTATIVE" | "DECLINED") { const data = await requestJson(`/api/meetings/${meeting.id}/participants/${participantId}`, { method: "PATCH", body: JSON.stringify({ rsvp: rsvpValue }) }); void data; const fresh = await requestJson(`/api/meetings/${meeting.id}`); onUpdated(MeetingSchema.parse(fresh)); }
	async function saveArtifact() { setSavingArtifact(true); try { const data = await requestJson(`/api/meetings/${meeting.id}/artifacts`, { method: "POST", body: JSON.stringify({ kind: artifactKind, transcript: artifactKind === "TRANSCRIPT" ? artifactText : null, contentJson: artifactKind === "NOTES" ? { text: artifactText } : null, language: artifactKind === "TRANSCRIPT" ? "pt" : null }) }); onUpdated(MeetingSchema.parse(await requestJson(`/api/meetings/${meeting.id}`))); setArtifactText(""); void data; } finally { setSavingArtifact(false); } }
	async function convert(artifactId: string, typeKey: string) { const data = await requestJson(`/api/meetings/${meeting.id}/artifacts/${artifactId}/convert`, { method: "POST", body: JSON.stringify({ typeKey }) }); void data; onUpdated(MeetingSchema.parse(await requestJson(`/api/meetings/${meeting.id}`))); }
	const mine = meeting.participants.find((participant) => participant.userId === currentUserId);
	return <Card><div className="oryon-meeting-detail"><header className="oryon-meeting-detail-header"><div><span className="oryon-eyebrow">{humanDate(meeting.startAt, meeting.timezone)} · {humanTime(meeting.startAt, meeting.timezone)}–{humanTime(meeting.endAt, meeting.timezone)}</span><h2>{meeting.title}</h2><p>{meeting.agenda.join(" · ") || COPY.description}</p></div><Button variant="ghost" onClick={onClose}>{COPY.close}</Button></header><div className="oryon-meeting-detail-actions">{meeting.permissions.manage && meeting.state === "SCHEDULED" ? <Button variant="primary" onClick={() => void changeState("LIVE")}>{COPY.startMeeting}</Button> : null}{meeting.state === "LIVE" && mine ? <Button variant="primary" onClick={onJoin}>{COPY.join}</Button> : null}{meeting.state === "SCHEDULED" && meeting.permissions.manage ? <Button variant="danger" onClick={() => void changeState("CANCELLED")}>{COPY.cancelMeeting}</Button> : null}{mine && meeting.state === "SCHEDULED" ? <div className="oryon-rsvp-actions"><span>{COPY.rsvp}</span><Button variant={mine.rsvp === "ACCEPTED" ? "primary" : "secondary"} size="sm" onClick={() => void rsvp(mine.id, "ACCEPTED")}><Check size={15} strokeWidth={1.5} />{COPY.accept}</Button><Button variant={mine.rsvp === "TENTATIVE" ? "primary" : "secondary"} size="sm" onClick={() => void rsvp(mine.id, "TENTATIVE")}>{COPY.tentative}</Button><Button variant={mine.rsvp === "DECLINED" ? "danger" : "secondary"} size="sm" onClick={() => void rsvp(mine.id, "DECLINED")}>{COPY.decline}</Button></div> : null}</div><div className="oryon-meeting-detail-grid"><section><div className="oryon-section-heading"><Users size={17} strokeWidth={1.5} /><h3>{COPY.participants}</h3></div><div className="oryon-participant-list">{meeting.participants.map((participant) => <div className="oryon-participant-row" key={participant.id}><div className="oryon-avatar oryon-avatar-md">{(participant.user?.displayName ?? participant.user?.name ?? participant.email ?? "?").slice(0, 2).toUpperCase()}</div><div><strong>{participant.user?.displayName ?? participant.user?.name ?? participant.email}</strong><span>{participant.role} · {participant.rsvp}</span></div></div>)}</div></section><section><div className="oryon-section-heading"><FileText size={17} strokeWidth={1.5} /><h3>{COPY.artifacts}</h3></div><div className="oryon-artifact-list">{meeting.artifacts.map((artifact) => <div className="oryon-artifact-row" key={artifact.id}><div><strong>{artifact.kind}</strong><span>{artifact.transcript ?? (artifact.contentJson && typeof artifact.contentJson === "object" && "text" in artifact.contentJson ? String((artifact.contentJson as { text?: unknown }).text ?? "") : "")}</span></div>{["TASKS", "DECISIONS"].includes(artifact.kind) ? <Button variant="secondary" size="sm" onClick={() => void convert(artifact.id, artifact.kind === "TASKS" ? "task" : "task")}>{COPY.convert}</Button> : null}</div>)}</div><div className="oryon-artifact-composer"><SelectPill label={COPY.artifacts} value={artifactKind} onChange={(event) => setArtifactKind(event.target.value as MeetingArtifactCreateInput["kind"])} options={[{ value: "NOTES", label: COPY.notes }, { value: "TRANSCRIPT", label: COPY.transcript }, { value: "DECISIONS", label: "Decisões" }, { value: "TASKS", label: "Tasks" }]} /><Textarea label={COPY.notes} value={artifactText} onChange={(event) => setArtifactText(event.target.value)} placeholder={COPY.notes} /><Button variant="primary" loading={savingArtifact} disabled={savingArtifact || artifactText.trim().length === 0} onClick={() => void saveArtifact()}>{COPY.saveArtifact}</Button></div></section></div></div></Card>;
}

export function MeetingsStudio() {
	const [meetings, setMeetings] = useState<Meeting[]>([]);
	const [rooms, setRooms] = useState<Array<{ id: string; name: string; capacity: number }>>([]);
	const [currentUserId, setCurrentUserId] = useState("");
	const [timezone, setTimezone] = useState("Africa/Maputo");
	const [week, setWeek] = useState(() => startOfWeek(new Date()));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [joining, setJoining] = useState<Meeting | null>(null);
	const [loading, setLoading] = useState(true);
	const selected = meetings.find((meeting) => meeting.id === selectedId) ?? null;
	const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(week); day.setDate(day.getDate() + index); return day; }), [week]);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const from = new Date(week); const to = new Date(week); to.setDate(to.getDate() + 7);
			const [identity, rows, roomRows] = await Promise.all([requestJson("/api/auth/session", { method: "GET" }), requestJson(`/api/meetings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`), requestJson("/api/meetings/rooms")]);
			const context = IdentityContextSchema.parse(identity); setCurrentUserId(context.user.id); setTimezone(context.user.timezone); setMeetings((rows as unknown[]).map((row) => MeetingSchema.parse(row))); setRooms(roomRows as Array<{ id: string; name: string; capacity: number }>);
		} finally { setLoading(false); }
	}, [week]);
	useEffect(() => { void load(); }, [load]);

	const meetingsByDay = useMemo(() => days.map((day) => meetings.filter((meeting) => { const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(meeting.startAt)); const target = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(day); return date === target; }).sort((a, b) => a.startAt.localeCompare(b.startAt))), [days, meetings, timezone]);
	function handleCreated(meeting: Meeting) { setMeetings((current) => [...current, meeting].sort((a, b) => a.startAt.localeCompare(b.startAt))); setCreating(false); setSelectedId(meeting.id); }
	if (joining) return <LiveMeeting meeting={joining} onClose={() => setJoining(null)} onEnded={() => { setJoining(null); void load(); }} />;
	return <div className="oryon-meetings-page"><PageHeader title={COPY.title} description={COPY.description} actions={<div className="oryon-meeting-toolbar"><Button variant="secondary" onClick={() => setWeek(startOfWeek(new Date(week.getTime() - 7 * 86400000)))} aria-label="Semana anterior"><ChevronLeft size={17} strokeWidth={1.5} /></Button><Button variant="secondary" onClick={() => setWeek(startOfWeek(new Date(week.getTime() + 7 * 86400000)))} aria-label="Semana seguinte"><ChevronRight size={17} strokeWidth={1.5} /></Button><Button variant="primary" onClick={() => setCreating(true)}><Plus size={17} strokeWidth={1.5} />{COPY.newMeeting}</Button></div>} />
		{creating ? <CreateMeeting timezone={timezone} rooms={rooms} onCreated={handleCreated} onCancel={() => setCreating(false)} /> : null}
		{loading ? <Card><div className="oryon-loading-state">A carregar…</div></Card> : <div className="oryon-calendar-grid">{meetingsByDay.map((dayMeetings, index) => <section className="oryon-calendar-day" key={days[index]!.toISOString()}><header><span>{humanDate(days[index]!.toISOString(), timezone)}</span><strong>{dayMeetings.length}</strong></header>{dayMeetings.length === 0 ? <div className="oryon-calendar-empty">{COPY.noMeetings}</div> : dayMeetings.map((meeting) => <button type="button" className={`oryon-calendar-meeting ${selectedId === meeting.id ? "is-selected" : ""}`} key={meeting.id} onClick={() => setSelectedId(meeting.id)}><span className="oryon-calendar-time">{humanTime(meeting.startAt, timezone)}</span><strong>{meeting.title}</strong><span className="oryon-calendar-status"><StatusChip state={meeting.state === "LIVE" ? "positive" : meeting.state === "CANCELLED" ? "danger" : "neutral"}>{statusLabel(meeting.state)}</StatusChip></span></button>)}</section>)}</div>}
		{selected ? <MeetingDetail meeting={selected} currentUserId={currentUserId} onUpdated={(meeting) => { setMeetings((current) => current.map((entry) => entry.id === meeting.id ? meeting : entry)); setSelectedId(meeting.id); }} onClose={() => setSelectedId(null)} onJoin={() => setJoining(selected)} /> : null}
	</div>;
}
