import { DashboardError, DashboardView } from "../components/dashboard-view";
import { parseDashboardRange } from "../lib/dashboard";
import { getDashboardPayload } from "../lib/supabase";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const range = parseDashboardRange(resolvedSearchParams.range);
  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "BME280 Dashboard";

  try {
    const payload = await getDashboardPayload(range);
    return <DashboardView appName={appName} payload={payload} range={range} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return <DashboardError appName={appName} range={range} message={message} />;
  }
}
