"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
	Bell,
	Hash,
	MessageCircle,
	Paperclip,
	Plus,
	Send,
	Smile,
	Sparkles,
	Users,
	X,
} from "lucide-react";
import {
	Avatar,
	Button,
	Card,
	EmptyState,
	ErrorState,
	SearchField,
	StatusChip,
	Textarea,
} from "@oryon/ui";
import {
	ChannelSchema,
	MessageSchema,
	NotificationSchema,
	type Channel,
	type Message,
	type Notification,
} from "@oryon/contracts/communication";
import type { IdentityContext } from "@oryon/contracts/identity";

const copy = {
	title: "Comunicação",
	subtitle: "Canais, conversas e decisões num único espaço de trabalho.",
	channels: "Canais",
	direct: "Direct",
	inbox: "Inbox",
	newChannel: "Novo canal",
	search: "Pesquisar conversas",
	noChannels: "Sem canais",
	noChannelsDetail: "Crie um canal ou inicie uma conversa directa.",
	noMessages: "Sem mensagens",
	noMessagesDetail: "Esta conversa ainda está vazia.",
	thread: "Thread",
	noThread: "Seleccione uma mensagem para abrir a thread.",
	composer: "Escreva uma mensagem…",
	send: "Enviar",
	replies: "respostas",
	mentionSearch: "Pesquisar pessoa",
	convert: "Criar trabalho",
	notifications: "Notificações",
	markAll: "Marcar tudo como lido",
	connected: "Ligado",
	channelName: "Nome do canal",
	topic: "Tópico",
	create: "Criar",
	cancel: "Cancelar",
	typeMessage: "Mensagem",
	newDm: "Nova conversa",
	peopleSearch: "Pesquisar pessoas",
	noPeople: "Nenhuma pessoa encontrada",
	close: "Fechar",
	reaction: "Reagir",
	openThread: "Abrir thread",
} as const;
type ApiPayload = { data?: unknown; error?: { message?: string } };
type Person = {
	id: string;
	name: string;
	displayName: string | null;
	avatarUrl: string | null;
	presence: string;
	email: string;
};
async function api(path: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(`/api/communication/${path}`, {
		...init,
		cache: "no-store",
	});
	const payload = (await response.json()) as ApiPayload;
	if (!response.ok || payload.data === undefined)
		throw new Error(payload.error?.message ?? "Operação falhou");
	return payload.data;
}
function orgCookie(): string | undefined {
	const cookie = typeof document === "undefined" ? "" : document.cookie;
	return cookie
		.split(";")
		.map((item) => item.trim())
		.find((item) => item.startsWith("oryon_org="))
		?.slice("oryon_org=".length);
}
function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((part) => part[0] ?? "")
		.join("")
		.slice(0, 2)
		.toUpperCase();
}
function formatTime(value: string): string {
	return new Intl.DateTimeFormat("pt-PT", {
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function MessageItem({
	message,
	onThread,
	onReact,
	onConvert,
}: {
	message: Message;
	onThread: () => void;
	onReact: (emoji: string, reacted: boolean) => void;
	onConvert: () => void;
}) {
	return (
		<article className="com-message">
			<Avatar
				name={message.author.displayName ?? message.author.name}
				aria-label={message.author.displayName ?? message.author.name}
			/>
			<div className="com-message-body">
				<div className="com-message-meta">
					<strong>{message.author.displayName ?? message.author.name}</strong>
					<time>{formatTime(message.createdAt)}</time>
				</div>
				<p>{message.bodyText}</p>
				<div className="com-message-actions">
					{(message.reactions.length
						? message.reactions
						: [{ emoji: "👍", count: 0, reacted: false }]
					).map((reaction) => (
						<button
							type="button"
							key={reaction.emoji}
							className={
								reaction.reacted ? "com-reaction active" : "com-reaction"
							}
							onClick={() => onReact(reaction.emoji, reaction.reacted)}
							aria-label={`${copy.reaction} ${reaction.emoji}`}
						>
							{reaction.emoji}
							{reaction.count > 0 ? ` ${reaction.count}` : ""}
						</button>
					))}
					<button
						type="button"
						className="com-action-link"
						onClick={onThread}
						aria-label={copy.openThread}
					>
						<MessageCircle size={14} strokeWidth={1.5} />
						{message.replyCount} {copy.replies}
					</button>
					<button
						type="button"
						className="com-action-link"
						onClick={onConvert}
						aria-label={copy.convert}
					>
						<Sparkles size={14} strokeWidth={1.5} />
						{copy.convert}
					</button>
				</div>
			</div>
		</article>
	);
}

export function CommunicationStudio({
	identity,
}: {
	identity: IdentityContext;
}) {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [selectedChannelId, setSelectedChannelId] = useState<string>();
	const [selectedThreadId, setSelectedThreadId] = useState<string>();
	const [threadMessages, setThreadMessages] = useState<Message[]>([]);
	const [query, setQuery] = useState("");
	const [text, setText] = useState("");
	const [threadText, setThreadText] = useState("");
	const [mentionIds, setMentionIds] = useState<string[]>([]);
	const [mentionOpen, setMentionOpen] = useState(false);
	const [channelName, setChannelName] = useState("");
	const [channelTopic, setChannelTopic] = useState("");
	const [showChannelCreate, setShowChannelCreate] = useState(false);
	const [showDmCreate, setShowDmCreate] = useState(false);
	const [showInbox, setShowInbox] = useState(false);
	const [peopleQuery, setPeopleQuery] = useState("");
	const [people, setPeople] = useState<Person[]>([]);
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string>();
	const socketRef = useRef<Socket | undefined>(undefined);
	const lastSeenRef = useRef<string | undefined>(undefined);
	const filteredChannels = useMemo(() => {
		const q = query.trim().toLocaleLowerCase();
		return q
			? channels.filter((channel) =>
					`${channel.name} ${channel.topic ?? ""}`
						.toLocaleLowerCase()
						.includes(q),
				)
			: channels;
	}, [channels, query]);
	const selectedChannel = useMemo(
		() => channels.find((channel) => channel.id === selectedChannelId),
		[channels, selectedChannelId],
	);
	const unreadTotal = useMemo(
		() => channels.reduce((total, channel) => total + channel.unreadCount, 0),
		[channels],
	);
	const mentionMatches = useMemo(
		() =>
			mentionOpen
				? people.filter((person) => person.id !== identity.user.id).slice(0, 6)
				: [],
		[identity.user.id, mentionOpen, people],
	);
	async function loadChannels() {
		setLoading(true);
		setError(undefined);
		try {
			const [channelData, notificationData] = await Promise.all([
				api("channels"),
				api("notifications?unreadOnly=false&limit=50"),
			]);
			const nextChannels = Array.isArray(channelData)
				? channelData.map((item) => ChannelSchema.parse(item))
				: [];
			setChannels(nextChannels);
			setNotifications(
				Array.isArray(notificationData)
					? notificationData.map((item) => NotificationSchema.parse(item))
					: [],
			);
			setSelectedChannelId((current) =>
				current && nextChannels.some((channel) => channel.id === current)
					? current
					: nextChannels[0]?.id,
			);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível carregar a comunicação",
			);
		} finally {
			setLoading(false);
		}
	}
	async function loadMessages(channelId: string) {
		try {
			const data = await api(
				`channels/${encodeURIComponent(channelId)}/messages?limit=100`,
			);
			const raw = (data as { items?: unknown[] }).items ?? [];
			const next = raw.map((item) => MessageSchema.parse(item));
			setMessages(next);
			lastSeenRef.current = next[next.length - 1]?.createdAt;
			await api(`channels/${encodeURIComponent(channelId)}/read`, {
				method: "POST",
			});
			setChannels((current) =>
				current.map((channel) =>
					channel.id === channelId ? { ...channel, unreadCount: 0 } : channel,
				),
			);
			socketRef.current?.emit("channel:join", channelId);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível carregar a conversa",
			);
		}
	}
	async function loadThread(messageId: string) {
		const data = await api(
			`channels/${encodeURIComponent(selectedChannelId ?? "")}/messages?limit=100&parentId=${encodeURIComponent(messageId)}`,
		);
		const raw = (data as { items?: unknown[] }).items ?? [];
		setThreadMessages(raw.map((item) => MessageSchema.parse(item)));
		setSelectedThreadId(messageId);
	}
	function updateComposer(value: string) {
		setText(value);
		const match = value.match(/(?:^|\s)@([^\s@]*)$/);
		if (match) {
			setPeopleQuery(match[1] ?? "");
			setMentionOpen(true);
		} else setMentionOpen(false);
	}
	function chooseMention(person: Person) {
		const match = text.match(/(?:^|\s)@([^\s@]*)$/);
		const queryLength = match?.[1]?.length ?? 0;
		setText(
			match
				? `${text.slice(0, text.length - queryLength)}${person.displayName ?? person.name} `
				: `${text}@${person.displayName ?? person.name} `,
		);
		setMentionIds((current) =>
			current.includes(person.id) ? current : [...current, person.id],
		);
		setMentionOpen(false);
		setPeopleQuery("");
	}
	async function sendMessage(parentId?: string) {
		const body = (parentId ? threadText : text).trim();
		if (!selectedChannelId || !body || sending) return;
		setSending(true);
		try {
			const result = await api(
				`channels/${encodeURIComponent(selectedChannelId)}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						bodyText: body,
						parentId: parentId ?? null,
						mentions: parentId ? [] : mentionIds,
						kind: "TEXT",
					}),
				},
			);
			const message = MessageSchema.parse(result);
			if (parentId) {
				setThreadMessages((current) => [...current, message]);
				setThreadText("");
			} else {
				setMessages((current) => [...current, message]);
				setText("");
				setMentionIds([]);
				setMentionOpen(false);
			}
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível enviar a mensagem",
			);
		} finally {
			setSending(false);
		}
	}
	async function react(messageId: string, emoji: string, reacted: boolean) {
		try {
			const path = `messages/${encodeURIComponent(messageId)}/reactions${reacted ? `/${encodeURIComponent(emoji)}` : ""}`;
			await api(path, {
				method: reacted ? "DELETE" : "POST",
				headers: { "Content-Type": "application/json" },
				...(reacted ? {} : { body: JSON.stringify({ emoji }) }),
			});
			if (selectedChannelId) await loadMessages(selectedChannelId);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível actualizar a reacção",
			);
		}
	}
	async function convert(messageId: string) {
		try {
			await api(`messages/${encodeURIComponent(messageId)}/convert`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					typeKey: "task",
					workspaceId: identity.workspaces[0]?.id ?? null,
				}),
			});
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível criar trabalho",
			);
		}
	}
	async function createChannel() {
		if (!channelName.trim()) return;
		try {
			const result = await api("channels", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: channelName.trim(),
					topic: channelTopic.trim() || null,
					workspaceId: identity.workspaces[0]?.id ?? null,
					kind: "TEXT",
					visibility: "ORG",
				}),
			});
			const channel = ChannelSchema.parse(result);
			setChannels((current) => [...current, channel]);
			setSelectedChannelId(channel.id);
			setShowChannelCreate(false);
			setChannelName("");
			setChannelTopic("");
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível criar o canal",
			);
		}
	}
	async function openDm(userId: string) {
		try {
			const result = await api("channels/direct", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userIds: [userId] }),
			});
			const channel = ChannelSchema.parse(result);
			setChannels((current) =>
				current.some((item) => item.id === channel.id)
					? current
					: [...current, channel],
			);
			setSelectedChannelId(channel.id);
			setShowDmCreate(false);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível iniciar a conversa",
			);
		}
	}
	async function loadPeople() {
		try {
			const data = await api(
				`people?q=${encodeURIComponent(peopleQuery)}&limit=20`,
			);
			setPeople(Array.isArray(data) ? (data as Person[]) : []);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível pesquisar pessoas",
			);
		}
	}
	async function markNotification(id: string) {
		try {
			const updated = NotificationSchema.parse(
				await api(`notifications/${encodeURIComponent(id)}/read`, {
					method: "POST",
				}),
			);
			setNotifications((current) =>
				current.map((item) => (item.id === id ? updated : item)),
			);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível marcar a notificação",
			);
		}
	}
	async function markAll() {
		try {
			await api("notifications/read-all", { method: "POST" });
			setNotifications((current) =>
				current.map((item) => ({
					...item,
					readAt: item.readAt ?? new Date().toISOString(),
				})),
			);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível actualizar a inbox",
			);
		}
	}
	useEffect(() => {
		void loadChannels();
	}, []);
	useEffect(() => {
		if (selectedChannelId) void loadMessages(selectedChannelId);
	}, [selectedChannelId]);
	useEffect(() => {
		if (showDmCreate || mentionOpen) void loadPeople();
	}, [showDmCreate, mentionOpen, peopleQuery]);
	useEffect(() => {
		const organizationId = orgCookie();
		if (!organizationId) return;
		const socket = io(
			process.env.NEXT_PUBLIC_ORYON_API_URL ?? "http://localhost:4000",
			{
				path: "/socket.io",
				withCredentials: true,
				auth: { orgId: organizationId },
			},
		);
		socketRef.current = socket;
		socket.on("message.created", (payload: unknown) => {
			try {
				const message = MessageSchema.parse(payload);
				if (message.channelId === selectedChannelId && !message.parentId) {
					setMessages((current) =>
						current.some((item) => item.id === message.id)
							? current
							: [...current, message],
					);
					lastSeenRef.current = message.createdAt;
				}
			} catch {
				return;
			}
		});
		socket.on("message.updated", () => {
			if (selectedChannelId) void loadMessages(selectedChannelId);
		});
		socket.on("message.deleted", (payload: { messageId?: string }) => {
			if (payload.messageId)
				setMessages((current) =>
					current.filter((message) => message.id !== payload.messageId),
				);
		});
		socket.on("reaction.updated", () => {
			if (selectedChannelId) void loadMessages(selectedChannelId);
		});
		socket.on("notification.created", () => {
			void loadChannels();
		});
		socket.on("connect", () => {
			if (selectedChannelId) void loadMessages(selectedChannelId);
		});
		return () => {
			socket.disconnect();
			socketRef.current = undefined;
		};
	}, [selectedChannelId]);
	useEffect(() => {
		const handler = () => {
			if (!selectedChannelId) return;
			const since = lastSeenRef.current
				? `?since=${encodeURIComponent(lastSeenRef.current)}`
				: "?limit=100";
			void api(
				`channels/${encodeURIComponent(selectedChannelId)}/catch-up${since}`,
			)
				.then((data) => {
					const rows = Array.isArray(data)
						? data.map((item) => MessageSchema.parse(item))
						: [];
					if (rows.length)
						setMessages((current) => [
							...current,
							...rows.filter(
								(message) => !current.some((item) => item.id === message.id),
							),
						]);
				})
				.catch(() => undefined);
		};
		window.addEventListener("online", handler);
		return () => window.removeEventListener("online", handler);
	}, [selectedChannelId]);
	if (loading)
		return (
			<section className="com-shell">
				<Card>
					<div className="com-loading" />
				</Card>
			</section>
		);
	if (error && channels.length === 0)
		return (
			<section className="com-shell">
				<ErrorState
					title={copy.title}
					detail={error}
					action={
						<Button onClick={() => void loadChannels()}>
							Tentar novamente
						</Button>
					}
				/>
			</section>
		);
	return (
		<section className="com-shell" aria-label={copy.title}>
			<header className="com-header">
				<div>
					<p className="com-kicker">Oryon Communication</p>
					<h1>{copy.title}</h1>
					<span>{copy.subtitle}</span>
				</div>
				<div className="com-header-actions">
					<Button
						variant="secondary"
						onClick={() => setShowInbox((value) => !value)}
					>
						<Bell size={16} strokeWidth={1.5} />
						{copy.inbox}
						{unreadTotal > 0 ? ` · ${unreadTotal}` : ""}
					</Button>
					<Button onClick={() => setShowChannelCreate(true)}>
						<Plus size={16} strokeWidth={1.5} />
						{copy.newChannel}
					</Button>
				</div>
			</header>
			{error ? (
				<p className="com-alert" role="alert">
					{error}
				</p>
			) : null}
			<div className="com-layout">
				<aside className="com-sidebar">
					<SearchField
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={copy.search}
						aria-label={copy.search}
					/>
					<div className="com-sidebar-section">
						<div className="com-section-head">
							<strong>{copy.channels}</strong>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setShowChannelCreate(true)}
								aria-label={copy.newChannel}
							>
								<Plus size={15} strokeWidth={1.5} />
							</Button>
						</div>
						{filteredChannels
							.filter((channel) => !["DM", "GROUP_DM"].includes(channel.kind))
							.map((channel) => (
								<button
									type="button"
									key={channel.id}
									className={
										channel.id === selectedChannelId
											? "com-channel active"
											: "com-channel"
									}
									onClick={() => setSelectedChannelId(channel.id)}
								>
									<Hash size={15} strokeWidth={1.5} />
									<span>{channel.name}</span>
									{channel.unreadCount > 0 ? (
										<strong>{channel.unreadCount}</strong>
									) : null}
								</button>
							))}
					</div>
					<div className="com-sidebar-section">
						<div className="com-section-head">
							<strong>{copy.direct}</strong>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setShowDmCreate(true)}
								aria-label={copy.newDm}
							>
								<Plus size={15} strokeWidth={1.5} />
							</Button>
						</div>
						{filteredChannels
							.filter((channel) => ["DM", "GROUP_DM"].includes(channel.kind))
							.map((channel) => (
								<button
									type="button"
									key={channel.id}
									className={
										channel.id === selectedChannelId
											? "com-channel active"
											: "com-channel"
									}
									onClick={() => setSelectedChannelId(channel.id)}
								>
									<MessageCircle size={15} strokeWidth={1.5} />
									<span>{channel.name}</span>
									{channel.unreadCount > 0 ? (
										<strong>{channel.unreadCount}</strong>
									) : null}
								</button>
							))}
					</div>
				</aside>
				<main className="com-main">
					{selectedChannel ? (
						<>
							<div className="com-conversation-head">
								<div>
									<div className="com-conversation-title">
										<Hash size={16} strokeWidth={1.5} />
										<h2>{selectedChannel.name}</h2>
									</div>
									<span>{selectedChannel.topic ?? "Sem tópico"}</span>
								</div>
								<div className="com-status">
									<StatusChip state="positive">{copy.connected}</StatusChip>
									<Users size={16} strokeWidth={1.5} />
								</div>
							</div>
							<div className="com-message-list">
								{messages.length ? (
									messages.map((message) => (
										<MessageItem
											key={message.id}
											message={message}
											onThread={() => void loadThread(message.id)}
											onReact={(emoji, reacted) =>
												void react(message.id, emoji, reacted)
											}
											onConvert={() => void convert(message.id)}
										/>
									))
								) : (
									<EmptyState
										title={copy.noMessages}
										detail={copy.noMessagesDetail}
									/>
								)}
							</div>
							<div className="com-composer">
								<button
									type="button"
									className="com-composer-tool"
									aria-label="Anexo"
								>
									<Paperclip size={16} strokeWidth={1.5} />
								</button>
								<div className="com-composer-editor">
									<Textarea
										label={copy.typeMessage}
										value={text}
										onChange={(event) => updateComposer(event.target.value)}
										placeholder={copy.composer}
										onKeyDown={(event) => {
											if (event.key === "Enter" && !event.shiftKey) {
												event.preventDefault();
												void sendMessage();
											}
										}}
									/>
									{mentionOpen && mentionMatches.length ? (
										<div
											className="com-mention-menu"
											role="listbox"
											aria-label={copy.mentionSearch}
										>
											{mentionMatches.map((person) => (
												<button
													type="button"
													key={person.id}
													className="com-person com-person-mention"
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => chooseMention(person)}
												>
													<Avatar
														initials={initials(
															person.displayName ?? person.name,
														)}
														aria-label={person.displayName ?? person.name}
													/>
													<span>
														<strong>{person.displayName ?? person.name}</strong>
														<small>{person.email}</small>
													</span>
												</button>
											))}
										</div>
									) : null}
								</div>
								<button
									type="button"
									className="com-composer-tool"
									aria-label="Emoji"
								>
									<Smile size={16} strokeWidth={1.5} />
								</button>
								<Button
									onClick={() => void sendMessage()}
									disabled={!text.trim() || sending}
									aria-label={copy.send}
								>
									<Send size={16} strokeWidth={1.5} />
									{copy.send}
								</Button>
							</div>
						</>
					) : (
						<EmptyState
							title={copy.noChannels}
							detail={copy.noChannelsDetail}
							action={
								<Button onClick={() => setShowChannelCreate(true)}>
									{copy.newChannel}
								</Button>
							}
						/>
					)}
				</main>
				<aside
					className={
						showInbox || selectedThreadId ? "com-context open" : "com-context"
					}
				>
					{showInbox ? (
						<div className="com-context-panel">
							<div className="com-context-head">
								<h3>{copy.notifications}</h3>
								<button
									type="button"
									onClick={() => setShowInbox(false)}
									aria-label={copy.close}
								>
									<X size={16} strokeWidth={1.5} />
								</button>
							</div>
							<Button size="sm" variant="ghost" onClick={() => void markAll()}>
								{copy.markAll}
							</Button>
							<div className="com-inbox-list">
								{notifications.length ? (
									notifications.map((notification) => (
										<button
											type="button"
											key={notification.id}
											className={
												notification.readAt
													? "com-notification"
													: "com-notification unread"
											}
											onClick={() => void markNotification(notification.id)}
										>
											<strong>{notification.title}</strong>
											<span>{notification.body ?? ""}</span>
										</button>
									))
								) : (
									<EmptyState
										title={copy.noMessages}
										detail={copy.noMessagesDetail}
									/>
								)}
							</div>
						</div>
					) : selectedThreadId ? (
						<div className="com-context-panel">
							<div className="com-context-head">
								<h3>{copy.thread}</h3>
								<button
									type="button"
									onClick={() => {
										setSelectedThreadId(undefined);
										setThreadMessages([]);
									}}
									aria-label={copy.close}
								>
									<X size={16} strokeWidth={1.5} />
								</button>
							</div>
							<div className="com-thread-list">
								{threadMessages.map((message) => (
									<MessageItem
										key={message.id}
										message={message}
										onThread={() => undefined}
										onReact={(emoji, reacted) =>
											void react(message.id, emoji, reacted)
										}
										onConvert={() => void convert(message.id)}
									/>
								))}
							</div>
							<div className="com-thread-composer">
								<Textarea
									label={copy.typeMessage}
									value={threadText}
									onChange={(event) => setThreadText(event.target.value)}
									placeholder={copy.composer}
								/>
								<Button
									onClick={() => void sendMessage(selectedThreadId)}
									disabled={!threadText.trim() || sending}
								>
									{copy.send}
								</Button>
							</div>
						</div>
					) : (
						<div className="com-context-placeholder">
							<MessageCircle size={22} strokeWidth={1.5} />
							<p>{copy.noThread}</p>
						</div>
					)}
				</aside>
			</div>
			{showChannelCreate ? (
				<div
					className="com-modal-backdrop"
					role="presentation"
					onMouseDown={() => setShowChannelCreate(false)}
				>
					<Card
						className="com-modal"
						onMouseDown={(event) => event.stopPropagation()}
					>
						<div className="com-modal-head">
							<h3>{copy.newChannel}</h3>
							<button
								type="button"
								onClick={() => setShowChannelCreate(false)}
								aria-label={copy.close}
							>
								<X size={16} strokeWidth={1.5} />
							</button>
						</div>
						<SearchField
							value={channelName}
							onChange={(event) => setChannelName(event.target.value)}
							placeholder={copy.channelName}
							aria-label={copy.channelName}
						/>
						<Textarea
							label={copy.topic}
							value={channelTopic}
							onChange={(event) => setChannelTopic(event.target.value)}
						/>
						<div className="com-modal-actions">
							<Button
								variant="ghost"
								onClick={() => setShowChannelCreate(false)}
							>
								{copy.cancel}
							</Button>
							<Button
								onClick={() => void createChannel()}
								disabled={!channelName.trim()}
							>
								{copy.create}
							</Button>
						</div>
					</Card>
				</div>
			) : null}
			{showDmCreate ? (
				<div
					className="com-modal-backdrop"
					role="presentation"
					onMouseDown={() => setShowDmCreate(false)}
				>
					<Card
						className="com-modal"
						onMouseDown={(event) => event.stopPropagation()}
					>
						<div className="com-modal-head">
							<h3>{copy.newDm}</h3>
							<button
								type="button"
								onClick={() => setShowDmCreate(false)}
								aria-label={copy.close}
							>
								<X size={16} strokeWidth={1.5} />
							</button>
						</div>
						<SearchField
							value={peopleQuery}
							onChange={(event) => setPeopleQuery(event.target.value)}
							placeholder={copy.peopleSearch}
							aria-label={copy.peopleSearch}
						/>
						<div className="com-people-list">
							{people.length ? (
								people.map((person) => (
									<button
										type="button"
										key={person.id}
										className="com-person"
										onClick={() => void openDm(person.id)}
									>
										<Avatar
											initials={initials(person.displayName ?? person.name)}
											aria-label={person.displayName ?? person.name}
										/>
										<span>
											<strong>{person.displayName ?? person.name}</strong>
											<small>{person.email}</small>
										</span>
									</button>
								))
							) : (
								<EmptyState
									title={copy.noPeople}
									detail={copy.noMessagesDetail}
								/>
							)}
						</div>
					</Card>
				</div>
			) : null}
		</section>
	);
}
