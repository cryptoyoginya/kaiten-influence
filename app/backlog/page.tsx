import { getChannels } from "@/lib/data";
import BacklogView from "./BacklogView";

export default function BacklogPage() {
  const channels = getChannels();
  return <BacklogView channels={channels} />;
}
