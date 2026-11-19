import { Desk } from "~~/components/coupons/Desk";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <Desk view={view === "sandbox" ? "sandbox" : "tour"} />;
}
