import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./Card";

export function StatCard({
  title,
  value,
  icon: Icon,
  detail
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-50 text-primary">
          <Icon size={22} />
        </div>
      </CardContent>
    </Card>
  );
}

