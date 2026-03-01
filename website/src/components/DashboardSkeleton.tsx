import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-16" />
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex flex-col justify-end gap-1">
          {/* Fake bar chart skeleton */}
          <div className="flex items-end gap-2 h-full px-4">
            {[65, 40, 80, 55, 70, 45, 90, 60, 75, 50].map((h, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <Skeleton className="h-px w-full" />
          <div className="flex justify-between px-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-3 w-10" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Table header */}
          <div className="flex gap-4 pb-2 border-b">
            {[80, 56, 48, 64, 64, 56, 48].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: w }} />
            ))}
          </div>
          {/* Table rows */}
          {[...Array(5)].map((_, row) => (
            <div key={row} className="flex gap-4 py-1">
              {[80, 56, 48, 64, 64, 56, 48].map((w, i) => (
                <Skeleton key={i} className="h-4" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardContentSkeleton() {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Table */}
      <TableSkeleton />
    </>
  );
}
