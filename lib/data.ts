import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Channel = {
  name: string;
  link: string;
  niches: string[];
  subscribers: string;
  audience: string;
  themes: string;
  err_views: string;
  price_raw: string;
  referral: string;
  comments: string[];
  draft: boolean;
  shortlisted: boolean;
  // рабочие поля размещения (заполняются при заводе в спринт)
  post_date: string;
  post_topic: string;
  offer: string;
  creative: string;
  landing: string;
  utm: string;
};

export type Placement = {
  name: string;
  author_desc: string;
  audience: string;
  post_date: string;
  post_topic: string;
  offer: string;
  creative: string;
  landing: string;
  utm: string;
  price: string;
  price_discount: string;
  subscribers: string;
  avg_views: string;
  err: string;
  forecast_reach: string;
  forecast_cpv: string;
  steps: Record<string, boolean>;
};

export type Sprint = {
  id: string;
  title: string;
  date_from: string;
  date_to: string;
  status: string;
  placements: Placement[];
};

const DATA = join(process.cwd(), "data");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA, file), "utf-8")) as T;
}

export function getChannels(): Channel[] {
  return read<Channel[]>("channels.json");
}

export function getSprints(): Sprint[] {
  return read<Sprint[]>("sprints.json");
}

// порядок этапов пайплайна — единый источник для канбана
export const PIPELINE_STEPS = [
  "Креатив согл. Кайтен",
  "Креатив согл. автор",
  "Данные договора",
  "Договор составлен",
  "Договор подписан",
  "Счёт оплачен",
  "Маркировка готова",
  "Маркировка нанесена",
  "Опубликовано",
  "Аналитика",
];
