import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">404</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-8">Page not found</p>
        <Link 
          href="/"
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
