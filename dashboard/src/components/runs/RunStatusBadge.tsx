import { Badge } from '@/components/ui/Badge';
import { RunStatus, getStatusBadgeVariant } from '@/types';

interface RunStatusBadgeProps {
  status: RunStatus;
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const { variant, pulse } = getStatusBadgeVariant(status);
  return <Badge variant={variant} pulse={pulse}>{status}</Badge>;
}
