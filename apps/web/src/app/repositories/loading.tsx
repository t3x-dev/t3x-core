export default function Loading() {
  return (
    <main aria-label="Your repositories" className="p-8">
      <h1 className="text-xl font-semibold">Your repositories</h1>
      <output className="text-sm text-muted-foreground">Loading repositories…</output>
    </main>
  );
}
