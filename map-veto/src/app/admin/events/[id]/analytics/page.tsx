import { EventAnalytics } from '@/components/admin/EventAnalytics';

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventAnalytics key={id} eventId={id} />;
}
