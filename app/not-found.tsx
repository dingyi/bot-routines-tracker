import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="font-mono text-sm text-teal">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">页面不存在 · Page not found</h1>
      <p className="mt-3 text-muted">这个地址没有对应的页面。</p>
      <Link href="/" className="mt-6 inline-flex w-fit rounded-full bg-ink px-4 py-2 text-sm text-card">
        返回首页 · Back home
      </Link>
    </main>
  );
}
