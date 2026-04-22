'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import type { LLMProviderInfo } from '@/types/api';

interface ModelSelectorProps {
  initialProvider?: string | null;
  initialModel?: string | null;
  onChange: (provider: string | null, model: string | null) => void;
}

export function ModelSelector({ initialProvider, initialModel, onChange }: ModelSelectorProps) {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>(initialProvider ?? '');
  const [selectedModel, setSelectedModel] = useState<string>(initialModel ?? '');
  const { loadModels } = useAvailableModels();

  useEffect(() => {
    setSelectedProvider(initialProvider ?? '');
  }, [initialProvider]);

  useEffect(() => {
    setSelectedModel(initialModel ?? '');
  }, [initialModel]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadModels()
      .then((res) => {
        if (!cancelled) {
          setProviders(res.providers);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load models');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  const currentProvider = providers.find((p) => p.name === selectedProvider);
  const availableModels = currentProvider?.models ?? [];

  const handleProviderChange = (value: string) => {
    const newProvider = value === '__none__' ? '' : value;
    setSelectedProvider(newProvider);
    setSelectedModel('');
    onChange(newProvider || null, null);
  };

  const handleModelChange = (value: string) => {
    const newModel = value === '__none__' ? '' : value;
    setSelectedModel(newModel);
    onChange(selectedProvider || null, newModel || null);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading available models...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Could not load models: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider-select">Provider</Label>
        <Select value={selectedProvider || '__none__'} onValueChange={handleProviderChange}>
          <SelectTrigger id="provider-select" className="w-full">
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">None (use default)</span>
            </SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider.name} value={provider.name} disabled={!provider.available}>
                <span className={!provider.available ? 'text-muted-foreground' : undefined}>
                  {provider.label}
                  {!provider.available && ' (unavailable)'}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model-select">Model</Label>
        <Select
          value={selectedModel || '__none__'}
          onValueChange={handleModelChange}
          disabled={!selectedProvider || availableModels.length === 0}
        >
          <SelectTrigger id="model-select" className="w-full">
            <SelectValue
              placeholder={selectedProvider ? 'Select a model' : 'Select a provider first'}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">None (use default)</span>
            </SelectItem>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
