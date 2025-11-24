import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-8">Civil Construction App</h1>
      <div className="flex gap-4">
        <Link 
          href="/map" 
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
        >
          🗺️ OSM Infrastructure Explorer
        </Link>
        <a 
          href="https://api-civil.ganeshait.com/api-docs" 
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
        >
          📚 API Documentation
        </a>
      </div>
    </div>
  );
}
