"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Collaboration } from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Paperclip, Plus, Save, Search, Upload } from "lucide-react";
import * as Y from "yjs";
import { Button, Card, EmptyState, ErrorState, InvertedPanel, Input, SearchField, StatusChip, Textarea } from "@oryon/ui";
import { FileAssetSchema, PageSchema, PageVersionListSchema, type FileAsset, type Page, type PageVersion } from "@oryon/contracts/docs-files";
import { IdentityContextSchema, type IdentityContext } from "@oryon/contracts/identity";

const labels = {
  eyebrow: "Docs + Files", title: "Documentos", subtitle: "Escreva, organize, versione e publique conhecimento empresarial sem sair do OryonOS.", newPage: "Nova página", search: "Pesquisar documentos e ficheiros", pages: "Páginas", empty: "Ainda não existem páginas", emptyDetail: "Crie a primeira página para começar a construir o conhecimento da organização.", save: "Guardar", saving: "A guardar", saved: "Guardado", publish: "Publicar", unpublish: "Retirar publicação", published: "Publicado", draft: "Rascunho", versions: "Versões", attachments: "Anexos", upload: "Adicionar ficheiro", classification: "Classificação", indexable: "Indexável", slug: "Slug público", titleField: "Título", body: "Conteúdo", createError: "Não foi possível criar a página", loadError: "Não foi possível carregar os documentos", editorPlaceholder: "Comece a escrever…", noSelection: "Seleccione uma página", noSelectionDetail: "Escolha uma página na navegação para abrir o editor.", searchResults: "Resultados", noResults: "Sem resultados", uploadError: "Não foi possível enviar o ficheiro", attachError: "Não foi possível associar o ficheiro", publishError: "Não foi possível publicar a página", versionInfo: "Cada gravação de conteúdo cria uma versão imutável.", dirty: "Alterações por guardar", fileDrop: "Arraste um ficheiro ou escolha no computador", pageSaved: "Alterações guardadas" 
};

type ApiPayload = { data?: unknown; error?: { message?: string } };
async function api(path: string, init?: RequestInit): Promise<unknown> { const response = await fetch(path, { ...init, cache: "no-store" }); const payload = (await response.json()) as ApiPayload; if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Operação falhou"); return payload.data; }
function decodeBase64(value: string): Uint8Array { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function encodeBase64(value: Uint8Array): string { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
async function sha256(file: File): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function toolbarButton(label: string, onClick: () => void, active = false, children?: React.ReactNode) { return <button type="button" className={active ? "docs-editor-button active" : "docs-editor-button"} aria-label={label} title={label} onClick={onClick}>{children}</button>; }

function PageEditor({ page, onSaved }: { page: Page; onSaved: (page: Page) => void }) {
  const documentRef = useRef<Y.Doc | null>(null);
  const initialUpdate = useMemo(() => page.contentYjsBase64 ? decodeBase64(page.contentYjsBase64) : null, [page.id]);
  if (!documentRef.current) { const document = new Y.Doc(); if (initialUpdate) Y.applyUpdate(document, initialUpdate); documentRef.current = document; }
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editor = useEditor({ extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: documentRef.current as Y.Doc })], immediatelyRender: false, editorProps: { attributes: { class: "docs-editor-content" } } }, [page.id]);

  async function save() { if (!editor || !dirty) return; setSaving(true); try { const yUpdate = Y.encodeStateAsUpdate(documentRef.current as Y.Doc); const updated = PageSchema.parse(await api(`/api/pages/${encodeURIComponent(page.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: page.title, contentJson: editor.getJSON(), contentText: editor.getText(), contentYjsBase64: encodeBase64(yUpdate) }) })); onSaved(updated); setDirty(false); } finally { setSaving(false); } }
  useEffect(() => { if (!editor) return; const handler = () => { setDirty(true); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void save(), 1200); }; editor.on("update", handler); return () => { editor.off("update", handler); if (saveTimer.current) clearTimeout(saveTimer.current); }; }, [editor, dirty]);
  useEffect(() => () => documentRef.current?.destroy(), []);
  return <div className="docs-editor-wrap">
    <div className="docs-editor-toolbar" role="toolbar" aria-label={labels.body}>
      {toolbarButton("Negrito", () => editor?.chain().focus().toggleBold().run(), Boolean(editor?.isActive("bold")), <Bold size={16} strokeWidth={1.5} />)}
      {toolbarButton("Itálico", () => editor?.chain().focus().toggleItalic().run(), Boolean(editor?.isActive("italic")), <Italic size={16} strokeWidth={1.5} />)}
      {toolbarButton("Título", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), Boolean(editor?.isActive("heading", { level: 2 })), <Heading2 size={16} strokeWidth={1.5} />)}
      {toolbarButton("Lista", () => editor?.chain().focus().toggleBulletList().run(), Boolean(editor?.isActive("bulletList")), <List size={16} strokeWidth={1.5} />)}
      {toolbarButton("Lista numerada", () => editor?.chain().focus().toggleOrderedList().run(), Boolean(editor?.isActive("orderedList")), <ListOrdered size={16} strokeWidth={1.5} />)}
      <span className="docs-toolbar-spacer" />
      <span className="docs-save-state">{saving ? labels.saving : dirty ? labels.dirty : labels.saved}</span>
      <Button size="sm" variant="secondary" onClick={() => void save()} disabled={!dirty || saving}><Save size={15} strokeWidth={1.5} />{saving ? labels.saving : labels.save}</Button>
    </div>
    <EditorContent editor={editor} />
  </div>;
}

function PageTree({ pages, selectedId, onSelect }: { pages: Page[]; selectedId?: string; onSelect: (id: string) => void }) {
  const children = useMemo(() => { const map = new Map<string | null, Page[]>(); for (const page of pages) { const current = map.get(page.parentPageId) ?? []; current.push(page); map.set(page.parentPageId, current); } return map; }, [pages]);
  function render(parentId: string | null, depth: number): React.ReactNode { return (children.get(parentId) ?? []).map((page) => <div key={page.id}><button type="button" className={page.id === selectedId ? "docs-tree-item active" : "docs-tree-item"} style={{ paddingInlineStart: `calc(var(--space-3) + ${depth} * var(--space-4))` }} onClick={() => onSelect(page.id)}><span>{page.icon ?? "◦"}</span><span>{page.title}</span>{page.publishedAt ? <span className="docs-tree-dot" /> : null}</button>{render(page.id, depth + 1)}</div>); }
  return <nav className="docs-tree" aria-label={labels.pages}>{render(null, 0)}</nav>;
}

function FileAttachment({ file, onAttach }: { file: FileAsset; onAttach: () => void }) { return <Card className="docs-file-card"><div className="docs-file-icon"><Paperclip size={16} strokeWidth={1.5} /></div><div><strong>{file.name}</strong><small>{file.mimeType} · {file.sizeBytes} bytes</small></div>{file.downloadUrl ? <a className="docs-file-link" href={file.downloadUrl} target="_blank" rel="noreferrer">Abrir</a> : null}<Button size="sm" variant="ghost" onClick={onAttach}>{labels.attachments}</Button></Card>; }

export function DocsStudio() {
  const [identity, setIdentity] = useState<IdentityContext>();
  const [pages, setPages] = useState<Page[]>([]);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [selectedPage, setSelectedPage] = useState<Page>();
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState("");
  const [indexable, setIndexable] = useState(false);
  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const visibleSearch = useMemo(() => { const q = search.trim().toLocaleLowerCase(); return q ? pages.filter((page) => `${page.title} ${page.contentText ?? ""}`.toLocaleLowerCase().includes(q)) : pages; }, [pages, search]);
  async function loadPages(selectFirst = true) { setBusy(true); setError(undefined); try { const [identityData, pageData] = await Promise.all([api("/api/auth/session"), api("/api/pages")]); const nextIdentity = IdentityContextSchema.parse(identityData); const nextPages = PageSchema.array().parse(pageData); setIdentity(nextIdentity); setPages(nextPages); if (selectFirst) setSelectedId((current) => current && nextPages.some((page) => page.id === current) ? current : nextPages[0]?.id); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : labels.loadError); } finally { setBusy(false); } }
  async function loadSelected(id: string) { try { const [pageData, versionData, attachmentData] = await Promise.all([api(`/api/pages/${encodeURIComponent(id)}`), api(`/api/pages/${encodeURIComponent(id)}/versions`), api(`/api/pages/${encodeURIComponent(id)}/attachments`)]); const page = PageSchema.parse(pageData); setSelectedPage(page); setTitle(page.title); setClassification(page.classification ?? ""); setIndexable(page.indexable); setSlug(page.publishedSlug ?? ""); setPublished(Boolean(page.publishedAt)); setVersions(PageVersionListSchema.parse(versionData)); setFiles(FileAssetSchema.array().parse(attachmentData)); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : labels.loadError); } }
  useEffect(() => { void loadPages(); }, []);
  useEffect(() => { if (selectedId) void loadSelected(selectedId); }, [selectedId]);
  async function createPage() { try { const page = PageSchema.parse(await api("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: labels.newPage, workspaceId: identity?.workspaces[0]?.id ?? null, kind: "DOC" }) })); setPages((current) => [...current, page]); setSelectedId(page.id); setNotice(labels.saved); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : labels.createError); } }
  function saved(page: Page) { setSelectedPage(page); setPages((current) => current.map((item) => item.id === page.id ? page : item)); setTitle(page.title); setNotice(labels.pageSaved); }
  async function saveMeta() { if (!selectedPage) return; try { const page = PageSchema.parse(await api(`/api/pages/${encodeURIComponent(selectedPage.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || labels.newPage, classification: classification.trim() || null, indexable }) })); saved(page); } catch (requestError) { setError(requestError instanceof Error ? String(requestError) : labels.loadError); } }
  async function publish() { if (!selectedPage || !selectedPage.permissions.manage || !slug.trim()) return; try { const page = PageSchema.parse(await api(`/api/pages/${encodeURIComponent(selectedPage.id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishedSlug: slug.trim(), publish: !published }) })); saved(page); setPublished(Boolean(page.publishedAt)); setNotice(published ? labels.unpublish : labels.publish); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : labels.publishError); } }
  async function uploadFile(file: File) { if (!selectedPage || !selectedPage.permissions.update) return; try { const checksum = await sha256(file); const intent = await api("/api/files/upload-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, checksumSha256: checksum }) }) as { uploadId: string; fileId: string; storageKey: string; uploadUrl: string; expiresIn: number }; const put = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }); if (!put.ok) throw new Error(labels.uploadError); const completed = FileAssetSchema.parse(await api("/api/files/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: intent.uploadId, fileId: intent.fileId, storageKey: intent.storageKey, name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, checksumSha256: checksum }) })); await api(`/api/pages/${encodeURIComponent(selectedPage.id)}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: completed.id }) }); const attachmentData = FileAssetSchema.array().parse(await api(`/api/pages/${encodeURIComponent(selectedPage.id)}/attachments`)); setFiles(attachmentData); setNotice(completed.name); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : labels.uploadError); } }

  if (busy) return <section className="docs-shell"><Card><div className="docs-loading" /></Card></section>;
  if (error && pages.length === 0) return <section className="docs-shell"><ErrorState title={labels.loadError} detail={error} action={<Button onClick={() => void loadPages(false)}>Tentar novamente</Button>} /></section>;

  return <section className="docs-shell" aria-label={labels.title}>
    <header className="docs-header"><div><p>{labels.eyebrow}</p><h1>{labels.title}</h1><span>{labels.subtitle}</span></div><Button onClick={() => void createPage()}><Plus size={16} strokeWidth={1.5} />{labels.newPage}</Button></header>
    <div className="docs-layout">
      <aside className="docs-sidebar"><SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} aria-label={labels.search} /><div className="docs-sidebar-title"><strong>{labels.pages}</strong><span>{visibleSearch.length}</span></div>{visibleSearch.length ? <PageTree pages={visibleSearch} selectedId={selectedId} onSelect={setSelectedId} /> : <EmptyState title={labels.noResults} detail={labels.emptyDetail} />}</aside>
      <main className="docs-main">
        {selectedPage ? <><div className="docs-title-row"><Input label={labels.titleField} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void saveMeta()} /><div className="docs-title-state"><StatusChip state={published ? "positive" : "neutral"}>{published ? labels.published : labels.draft}</StatusChip><Button variant={published ? "secondary" : "primary"} onClick={() => void publish()} disabled={!selectedPage.permissions.manage || !slug.trim()}>{published ? labels.unpublish : labels.publish}</Button></div></div><PageEditor key={selectedPage.id} page={selectedPage} onSaved={saved} /></> : <EmptyState title={labels.noSelection} detail={labels.noSelectionDetail} />}
      </main>
      {selectedPage ? <aside className="docs-inspector"><InvertedPanel><div className="docs-inspector-section"><div className="docs-inspector-heading"><strong>{labels.classification}</strong></div><Input value={classification} onChange={(event) => setClassification(event.target.value)} onBlur={() => void saveMeta()} disabled={!selectedPage.permissions.manage} /></div><div className="docs-inspector-section"><label className="docs-check"><input type="checkbox" checked={indexable} onChange={(event) => { setIndexable(event.target.checked); setTimeout(() => void saveMeta(), 0); }} disabled={!selectedPage.permissions.manage} /><span>{labels.indexable}</span></label></div><div className="docs-inspector-section"><Input label={labels.slug} value={slug} onChange={(event) => setSlug(event.target.value)} onBlur={() => void saveMeta()} disabled={!selectedPage.permissions.manage} /></div></InvertedPanel><Card><div className="docs-inspector-heading"><strong>{labels.attachments}</strong><Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={!selectedPage.permissions.update}><Upload size={15} strokeWidth={1.5} /></Button><input ref={fileInput} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFile(file); }} /></div><div className="docs-file-list">{files.length ? files.map((file) => <FileAttachment key={file.id} file={file} onAttach={() => {}} />) : <p className="docs-muted">{labels.fileDrop}</p>}</div></Card><Card><div className="docs-inspector-heading"><strong>{labels.versions}</strong><span>{versions.length}</span></div><p className="docs-muted">{labels.versionInfo}</p><div className="docs-version-list">{versions.slice(0, 8).map((version) => <div className="docs-version" key={version.id}><span>v{version.version}</span><small>{new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(version.createdAt))}</small></div>)}</div></Card></aside> : null}
    </div>
    {notice ? <p className="docs-notice" role="status">{notice}</p> : null}{error ? <p className="docs-alert" role="alert">{error}</p> : null}
  </section>;
}
