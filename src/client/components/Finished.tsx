export function Finished() {
  return (
    <div className="grid h-full place-items-center p-6" data-testid="finished">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          ✓
        </div>
        <h1 className="text-lg font-semibold">Review finished</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Your comments were handed back to the agent. You can close this tab.
        </p>
      </div>
    </div>
  );
}
