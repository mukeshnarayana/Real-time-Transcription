export default function Header() {
  return (
    <header className="mb-6 flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Speech to Text
        </h1>
        <p className="text-sm text-slate-500">
          Real-time multilingual transcription (Hindi + English)
        </p>
      </div>
    </header>
  );
}
