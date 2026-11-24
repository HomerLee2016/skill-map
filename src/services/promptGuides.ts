import generic from '../../AI_content_generator_full_prompt_guide.md?raw';
import japanese from '../data/guides/japanese-n3.md?raw';
import spanish from '../data/guides/spanish.md?raw';
import type { GuideLanguage } from './promptGuideChoice';

/** The guides shipped with the app; a workspace's own saved guide wins over these. */
export const BUNDLED_GUIDES: Record<GuideLanguage | 'generic', string> = { japanese, spanish, generic };
