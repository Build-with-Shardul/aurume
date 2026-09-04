export default function WikiHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl">📖</div>
      <h1 className="mt-3 text-lg font-semibold text-neutral-900">Your workspace Wiki</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">
        Create pages, organize them into a hierarchy, and map them into any project&apos;s knowledge base. Pick a page on the left, or create a new one.
      </p>
    </div>
  );
}
