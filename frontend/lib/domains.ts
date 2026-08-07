/** 多领域配置：单实例多领域，AI 为默认领域。与 supabase/migrations 中 domain_configs 保持一致。 */

export type ThemeShade = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type ThemePalette = Record<ThemeShade, string>;

export interface DomainConfig {
  key: string;            // domain_configs.domain_key
  industry: string;       // persons.industry 中文枚举值
  nameEn: string;
  keywords: string;       // 默认采集关键词（逗号分隔）
  palette: ThemePalette;  // 运行时主题色（50-900）
  /** 领域内的细分方向（= persons.primary_domain），用于人才库「方向」筛选下拉 */
  subDirections?: string[];
}

const forest: ThemePalette = {
  '50': '#F0F7F3', '100': '#DBEDE3', '200': '#B7DCC8', '300': '#8FC6A8', '400': '#5FA888',
  '500': '#3D8A68', '600': '#2D6A4F', '700': '#245540', '800': '#1D4434', '900': '#163327',
};

const quantum: ThemePalette = {
  '50': '#F2F1F9', '100': '#E2E0F2', '200': '#C5C1E4', '300': '#A29BD3', '400': '#7A70B7',
  '500': '#5F54A3', '600': '#4A3F8C', '700': '#3B3270', '800': '#2F2859', '900': '#241E44',
};

const bio: ThemePalette = {
  '50': '#EFF6FB', '100': '#DCEBF5', '200': '#B4D4E9', '300': '#86B9D9', '400': '#5497C2',
  '500': '#3277A6', '600': '#1E5C8E', '700': '#184A72', '800': '#133B5B', '900': '#0E2C45',
};

const embodied: ThemePalette = {
  '50': '#FBF3EE', '100': '#F6E2D6', '200': '#EBC3AC', '300': '#DE9F7C', '400': '#CD7A4E',
  '500': '#C26A3C', '600': '#B85C2E', '700': '#944A25', '800': '#763B1E', '900': '#592D17',
};

const fusion: ThemePalette = {
  '50': '#F9EFEF', '100': '#F1DBDB', '200': '#E2B5B5', '300': '#CE8A8A', '400': '#B65C5C',
  '500': '#A14242', '600': '#8C2D2D', '700': '#712424', '800': '#5A1D1D', '900': '#441616',
};

const energy: ThemePalette = {
  '50': '#FBF8EC', '100': '#F5EED1', '200': '#E9DCA3', '300': '#DAC672', '400': '#C9AE47',
  '500': '#C0A438', '600': '#B89A2E', '700': '#947C25', '800': '#76631E', '900': '#594B17',
};

export const DOMAINS: DomainConfig[] = [
  { key: 'ai', industry: '人工智能', nameEn: 'Artificial Intelligence',
    keywords: 'large language model,multimodal AI,AI agent,AI infrastructure', palette: forest,
    subDirections: ['大模型', '多模态', 'AI Infra'] },
  { key: 'quantum_computing', industry: '量子计算', nameEn: 'Quantum Computing',
    keywords: 'quantum computing,quantum error correction,quantum algorithm,qubit', palette: quantum,
    subDirections: ['量子算法', '量子纠错', '量子硬件', '量子通信'] },
  { key: 'biomedicine', industry: '生物医药', nameEn: 'Biomedicine',
    keywords: 'drug discovery,bioinformatics,genomics,protein folding,CRISPR', palette: bio,
    subDirections: ['药物发现', '基因组学', '蛋白质', '临床转化'] },
  { key: 'embodied_ai', industry: '具身智能', nameEn: 'Embodied AI',
    keywords: 'embodied AI,robotics manipulation,humanoid robot,locomotion,Sim2Real', palette: embodied,
    subDirections: ['机器人控制', '人形机器人', '感知', 'Sim2Real'] },
  { key: 'fusion_energy', industry: '核聚变', nameEn: 'Fusion Energy',
    keywords: 'nuclear fusion,tokamak,stellarator,plasma physics,inertial confinement', palette: fusion,
    subDirections: ['托卡马克', '仿星器', '惯性约束', '等离子体'] },
  { key: 'new_energy', industry: '新能源', nameEn: 'New Energy',
    keywords: 'solid state battery,perovskite solar,hydrogen energy,energy storage,EV battery', palette: energy,
    subDirections: ['固态电池', '钙钛矿', '氢能', '储能'] },
];

export const DEFAULT_DOMAIN_KEY = 'ai';
export const DOMAIN_STORAGE_KEY = 'talent-graph.domain';

export function getDomainByKey(key?: string | null): DomainConfig {
  return DOMAINS.find((d) => d.key === key) || DOMAINS[0];
}

export function getDomainByIndustry(industry?: string | null): DomainConfig {
  return DOMAINS.find((d) => d.industry === industry) || DOMAINS[0];
}
