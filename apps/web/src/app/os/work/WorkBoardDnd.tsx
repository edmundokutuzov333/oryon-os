"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { StatusChip } from "@oryon/ui";
import type { WorkObjectResponse } from "@oryon/contracts/work-object";

type Column = { key: string; label: string; items: WorkObjectResponse[] };
const columnDefaults: Array<Pick<Column, "key" | "label">> = [
  { key: "BACKLOG", label: "Backlog" },
  { key: "TODO", label: "A fazer" },
  { key: "IN_PROGRESS", label: "Em progresso" },
  { key: "BLOCKED", label: "Bloqueado" },
  { key: "IN_REVIEW", label: "Em revisão" },
  { key: "DONE", label: "Concluído" },
  { key: "CANCELLED", label: "Cancelado" },
];

function tone(category: WorkObjectResponse["statusCategory"]): "positive" | "warning" | "danger" | "neutral" | "info" {
  if (category === "DONE") return "positive";
  if (category === "BLOCKED" || category === "CANCELLED") return "danger";
  if (category === "IN_PROGRESS" || category === "IN_REVIEW") return "info";
  if (category === "BACKLOG") return "neutral";
  return "warning";
}

function DraggableTask({ object, selected, onSelect }: { object: WorkObjectResponse; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: object.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.55 : 1 } : undefined;
  return <button ref={setNodeRef} style={style} className={selected ? "oe-task oe-task-selected" : "oe-task"} type="button" onClick={onSelect} {...listeners} {...attributes}><strong>{object.title}</strong><span>{object.humanId}</span><StatusChip state={tone(object.statusCategory)}>{object.priority}</StatusChip><small>{object.dueAt ? new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short" }).format(new Date(object.dueAt)) : "Sem prazo"}</small></button>;
}

function DropColumn({ column, selectedId, onSelect }: { column: Column; selectedId?: string; onSelect: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.key });
  return <section ref={setNodeRef} className={isOver ? "oe-column oe-column-over" : "oe-column"} aria-label={column.label}><header><div><strong>{column.label}</strong><span>{column.items.length}</span></div></header>{column.items.map((object) => <DraggableTask key={object.id} object={object} selected={object.id === selectedId} onSelect={() => onSelect(object.id)} />)}</section>;
}

export function WorkBoardDnd({ columns, selectedId, onSelect, onMove }: { columns: Column[]; selectedId?: string; onSelect: (id: string) => void; onMove: (objectId: string, statusCategory: string) => Promise<void> }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const completeColumns = columnDefaults.map((base) => ({ ...base, items: columns.find((column) => column.key === base.key)?.items ?? [] }));
  async function handleDragEnd(event: DragEndEvent) {
    const destination = typeof event.over?.id === "string" ? event.over.id : undefined;
    if (!destination || typeof event.active.id !== "string") return;
    const source = completeColumns.find((column) => column.items.some((item) => item.id === event.active.id));
    if (!source || source.key === destination) return;
    await onMove(event.active.id, destination);
  }
  return <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>{completeColumns.map((column) => <DropColumn key={column.key} column={column} selectedId={selectedId} onSelect={onSelect} />)}</DndContext>;
}
