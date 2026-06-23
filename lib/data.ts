import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Channel = {
  id?: string;
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
  id?: string;
  sprint_id?: string;
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
  // артефакты по этапам пайплайна
  data?: {
    creative?: string;
    creative_image?: string;
    creative_text?: string;
    // несколько вариантов креатива: картинка + текст + история версий текста
    creatives?: {
      image?: string;
      text?: string;
      history?: { text: string; at: string }[];
    }[];
    approve_dima?: boolean;
    approve_dasha?: boolean;
    approve_lesha?: boolean;
    ref_ready?: boolean;
    ref_registered?: boolean;
    contract_data?: string;
    contract_file?: string;
    payment?: string;
    erid?: string;
    post_link?: string;
    analytics_link?: string;
    note?: string;
    now_needed?: string;
    comment_dasha?: string;
    comment_dima?: string;
    comment_lesha?: string;
    comment_ksyusha?: string;
    comment_kristina?: string;
    // голосовые комменты (URL аудио в Storage), несколько на человека
    audio_dasha?: string[];
    audio_dima?: string[];
    audio_lesha?: string[];
    audio_ksyusha?: string[];
    audio_kristina?: string[];
    // реквизиты для автосборки договора (ключи = подстановки шаблона)
    contract?: Record<string, string>;
    ord_report_done?: boolean;
  };
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

export type Integration = {
  id: string;
  sprint_id: string;
  name: string;
  niche: string;
  date: string;
  landing: string;
  published: boolean;
  brief: {
    author_desc: string;
    audience: string;
    date: string;
    post_topic: string;
    offer: string;
    creative: string;
    landing: string;
    utm: string;
  };
  plan: { price: string; reach: string; cpv: string; err: string; views: string };
  result: {
    post_link: string;
    format: string;
    costs: { price: string; marking: string; tax: string; total: string };
    reach: {
      views: string;
      reach: string;
      likes: string;
      reposts: string;
      comments_count: string;
      er: string;
    };
    conversion: {
      clicks: string;
      registrations: string;
      activations: string;
      paying: string;
      revenue: string;
    };
    unit: {
      cpv: string;
      cpm: string;
      ctr: string;
      cpl: string;
      cac: string;
      romi: string;
      payback: string;
    };
    screens: { creative: string; stats: string; comments: string[] };
    lessons: {
      sentiment: string;
      worked: string;
      failed: string;
      learned: string;
      verdict: string;
    };
  };
};

export function getIntegrations(): Integration[] {
  return read<Integration[]>("integrations.json");
}

// порядок этапов пайплайна — единый источник для канбана
export const PIPELINE_STEPS = [
  "Внутреннее согласование",
  "Согласование с инфлом",
  "Реквизиты для договора",
  "Договор готов",
  "Договор подписан",
  "Оплата",
  "Маркировка получена",
  "Маркировка в посте",
  "Опубликовано",
  "Аналитика",
];
