import type { PedagogyRole } from '@/lib/types';

interface Props {
  role: PedagogyRole;
  className?: string;
}

const ROLE_CONFIG: Record<
  PedagogyRole,
  { label: string; className: string }
> = {
  introduction: { label: 'Intro', className: 'bg-blue-100 text-blue-700' },
  derivation: { label: 'Derived', className: 'bg-purple-100 text-purple-700' },
  explanation: {
    label: 'Explained',
    className: 'bg-teal-100 text-teal-700',
  },
  application: { label: 'Applied', className: 'bg-green-100 text-green-700' },
  comparison: { label: 'Compared', className: 'bg-orange-100 text-orange-700' },
  tangential: { label: 'Mentioned', className: 'bg-slate-100 text-slate-600' },
  example: { label: 'Example', className: 'bg-yellow-100 text-yellow-700' },
  summary: { label: 'Summary', className: 'bg-slate-200 text-slate-700' },
};

export function PedagogyBadge({ role, className }: Props) {
  const config = ROLE_CONFIG[role];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
