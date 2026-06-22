import { fetchChannels } from "@/lib/db";
import BacklogView from "./BacklogView";

export const dynamic = "force-dynamic";

export default async function BacklogPage() {
  const channels = await fetchChannels();
  return <BacklogView channels={channels} />;
}
