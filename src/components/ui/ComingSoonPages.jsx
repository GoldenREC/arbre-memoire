export default function ComingSoonPage({ title, description }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <div className="mb-4 text-4xl">🚧</div>
      <h1 className="mb-2 text-lg font-semibold">{title}</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {description || 'Cette section arrive dans une prochaine étape de construction.'}
      </p>
    </div>
  );
}
