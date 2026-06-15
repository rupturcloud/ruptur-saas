/**
 * Skeleton que simula a estrutura do AppShell (Sidebar + Header)
 * Utilizado durante o lazy loading de rotas ou inicialização pesada,
 * melhorando a percepção de performance (Optimistic UI fallback).
 */
export default function AppShellSkeleton() {
  return (
    <div className="flex h-screen w-full bg-[#0E1116] text-[#9AA2AE] font-sans">
      {/* Sidebar Skeleton */}
      <div className="hidden md:flex flex-col w-[260px] border-r border-white/5 bg-[#0E1116] p-4">
        {/* Logo area */}
        <div className="h-8 w-32 bg-white/5 rounded mb-8 animate-pulse" />
        
        {/* Nav items */}
        <div className="flex flex-col space-y-3">
          <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
          <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
          <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
          <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Skeleton */}
        <div className="h-[72px] border-b border-white/5 bg-[#0E1116]/80 flex items-center px-6 justify-between">
          <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
          <div className="flex gap-4">
            <div className="h-8 w-8 bg-white/5 rounded-full animate-pulse" />
            <div className="h-8 w-8 bg-white/5 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-32 bg-white/5 rounded-lg animate-pulse" />
              <div className="h-32 bg-white/5 rounded-lg animate-pulse" />
              <div className="h-32 bg-white/5 rounded-lg animate-pulse" />
            </div>

            <div className="h-96 w-full bg-white/5 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
