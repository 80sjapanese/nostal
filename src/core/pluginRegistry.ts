import { PluginDefinition } from '../types/Plugin';
import ContrastPlugin from '../plugins/subjects/contrast';
import UISamplePlugin from '../plugins/subjects/ui-sample1';

export const pluginRegistry: Record<string, PluginDefinition> = {
  [ContrastPlugin.id]: ContrastPlugin,
  [UISamplePlugin.id]: UISamplePlugin,
};

export const getPlugin = (id: string) => pluginRegistry[id];