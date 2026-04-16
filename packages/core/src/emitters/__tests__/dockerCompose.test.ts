import { describe, expect, it } from 'vitest';
import { emitDockerCompose } from '../dockerCompose';

describe('emitDockerCompose', () => {
  it('emits a minimal compose file', () => {
    const tree = {
      services: {
        app: { image: 'nginx:latest', restart: 'unless-stopped' },
      },
    };
    const yaml = emitDockerCompose(tree);
    expect(yaml).toBe('services:\n  app:\n    image: nginx:latest\n    restart: unless-stopped\n');
  });

  it('orders top-level keys: version, services, volumes, networks', () => {
    const tree = {
      networks: { net1: null },
      services: { app: { image: 'nginx' } },
      volumes: { v1: null },
      version: '3.9',
    };
    const yaml = emitDockerCompose(tree);
    const keys = yaml
      .split('\n')
      .filter((l) => /^[a-z]/.test(l))
      .map((l) => l.replace(/:.*$/, ''));
    expect(keys).toEqual(['version', 'services', 'volumes', 'networks']);
  });

  it('quotes port strings to prevent YAML int coercion', () => {
    const tree = {
      services: { app: { image: 'nginx', ports: ['80:80', '443:443'] } },
    };
    const yaml = emitDockerCompose(tree);
    expect(yaml).toContain('- "80:80"');
    expect(yaml).toContain('- "443:443"');
  });

  it('omits undefined optional slots', () => {
    const tree = { services: { app: { image: 'nginx' } } };
    const yaml = emitDockerCompose(tree);
    expect(yaml).not.toContain('container_name');
    expect(yaml).not.toContain('healthcheck');
  });

  it('is deterministic — same tree, same bytes', () => {
    const tree = {
      services: {
        b: { image: 'redis' },
        a: { image: 'postgres:16' },
      },
    };
    expect(emitDockerCompose(tree)).toBe(emitDockerCompose(tree));
  });

  it('sorts service names alphabetically for stability', () => {
    const tree = {
      services: { b: { image: 'redis' }, a: { image: 'postgres' } },
    };
    const yaml = emitDockerCompose(tree);
    const aIdx = yaml.indexOf('  a:');
    const bIdx = yaml.indexOf('  b:');
    expect(aIdx).toBeLessThan(bIdx);
  });

  it('orders service slots in canonical order', () => {
    const tree = {
      services: {
        app: {
          restart: 'always',
          image: 'nginx',
          ports: ['80'],
          command: '/bin/sh',
        },
      },
    };
    const yaml = emitDockerCompose(tree);
    const imageIdx = yaml.indexOf('image:');
    const commandIdx = yaml.indexOf('command:');
    const portsIdx = yaml.indexOf('ports:');
    const restartIdx = yaml.indexOf('restart:');
    expect(imageIdx).toBeLessThan(commandIdx);
    expect(commandIdx).toBeLessThan(portsIdx);
    expect(portsIdx).toBeLessThan(restartIdx);
  });
});
