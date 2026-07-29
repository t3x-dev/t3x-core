import { describe, expect, it } from 'vitest';
import {
  ESPHOME_CONFIG_COMMAND,
  ESPHOME_DEVICE_CONFIG_PATH,
  ESPHOME_DEVICE_INPUT_REF,
  ESPHOME_VALIDATION_PROVIDER,
  ESPHOME_VALIDATION_WORKFLOW_NAME,
  materializeEsphomeDeviceInput,
  WorkspaceValidationMaterializerError,
} from '../lib/workspace-validation/esphome-materializer';

describe('ESPHome workspace validation materializer', () => {
  it('materializes workspace.device into stable YAML and hashes', () => {
    const materialized = materializeDevice({
      wifi: {
        ssid: 'Lab',
        password: 'super-secret',
      },
      sensor: [
        {
          platform: 'wifi_signal',
          name: 'WiFi Signal',
        },
      ],
      esphome: {
        name: 'energy-meter',
      },
      esp32: {
        board: 'esp32dev',
      },
    });

    expect(materialized).toMatchObject({
      project_id: 'proj_esphome',
      workspace_id: 'workspace_esphome',
      workflow_name: ESPHOME_VALIDATION_WORKFLOW_NAME,
      provider: ESPHOME_VALIDATION_PROVIDER,
    });
    expect(materialized.files).toEqual([
      {
        from: ESPHOME_DEVICE_INPUT_REF,
        to: ESPHOME_DEVICE_CONFIG_PATH,
        format: 'yaml',
        content: [
          'esp32:',
          '  board: esp32dev',
          'esphome:',
          '  name: energy-meter',
          'sensor:',
          '  - name: WiFi Signal',
          '    platform: wifi_signal',
          'wifi:',
          '  password: __T3X_REDACTED_SECRET__',
          '  ssid: Lab',
          '',
        ].join('\n'),
      },
    ]);
    expect(materialized.subject_hash).toMatch(/^sha256:/);
    expect(materialized.input_hash).toMatch(/^sha256:/);
    expect(materialized.workflow_hash).toMatch(/^sha256:/);
    expect(materialized.validator_hash).toMatch(/^sha256:/);
    expect(materialized.files[0].content).not.toContain('super-secret');
    expect(ESPHOME_CONFIG_COMMAND).toEqual(['esphome', 'config', '/config/device.yaml']);
  });

  it('keeps hashes stable for reordered input and fresh for changed device state', () => {
    const left = materializeDevice({
      esphome: { name: 'energy-meter' },
      esp32: { board: 'esp32dev' },
    });
    const right = materializeDevice({
      esp32: { board: 'esp32dev' },
      esphome: { name: 'energy-meter' },
    });

    expect(right.files[0].content).toBe(left.files[0].content);
    expect(right.subject_hash).toBe(left.subject_hash);
    expect(right.input_hash).toBe(left.input_hash);
    expect(right.workflow_hash).toBe(left.workflow_hash);
    expect(right.validator_hash).toBe(left.validator_hash);

    const changed = materializeDevice({
      esphome: { name: 'energy-meter-v2' },
      esp32: { board: 'esp32dev' },
    });

    expect(changed.subject_hash).not.toBe(left.subject_hash);
    expect(changed.input_hash).not.toBe(left.input_hash);
    expect(changed.workflow_hash).toBe(left.workflow_hash);
    expect(changed.validator_hash).toBe(left.validator_hash);
  });

  it('rejects workspaces without ESPHome device state', () => {
    expect(() =>
      materializeEsphomeDeviceInput({
        projectId: 'proj_prd',
        workspaceId: 'workspace_prd',
        workspace: {
          summary: { audience: 'Product reviewers' },
        },
      })
    ).toThrowError(
      new WorkspaceValidationMaterializerError(
        'VALIDATION_INPUT_NOT_SUPPORTED',
        'ESPHome validation requires workspace.device candidate state.'
      )
    );
  });
});

function materializeDevice(device: Record<string, unknown>) {
  return materializeEsphomeDeviceInput({
    projectId: 'proj_esphome',
    workspaceId: 'workspace_esphome',
    workspace: { device },
  });
}
