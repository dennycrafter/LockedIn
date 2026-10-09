import { PopoutEditor } from "@/components/popout-editor";

export const dynamic = "force-dynamic";

// Pop out window (SPEC 8.7): one note in a small window the owner can park
// next to any tab. The id comes from /notes/popout?id=...; the client editor
// below loads, autosaves and refetches on focus.
export default async function NotesPopoutPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <PopoutEditor noteId={id ?? null} />;
}
