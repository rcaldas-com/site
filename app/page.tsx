// Esqueleto da landing page. Conteudo real entra depois -- o que importa
// aqui e' que a rota existe, e' 100% estatica e sai no build como
// out/index.html.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">RCaldas</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Infraestrutura, automação e sistemas sob medida.
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Página inicial em construção.
      </p>
    </main>
  );
}
