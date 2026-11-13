import { Desk } from "./_desk/Desk";

// The view is read on the server so the first paint is already the one asked for: `/` is the tour, `/?view=sandbox`
// every control at once.
const Home = async ({ searchParams }: { searchParams: Promise<{ view?: string }> }) => {
  const { view } = await searchParams;
  return <Desk view={view === "sandbox" ? "sandbox" : "tour"} />;
};

export default Home;
