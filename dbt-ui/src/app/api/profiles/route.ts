import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

const DBT_ROOT = process.env.DBT_PROJECT_ROOT
  ? path.resolve(process.env.DBT_PROJECT_ROOT)
  : path.resolve(process.cwd(), '..');

export interface ProfilesResponse {
  profiles: string[];           // list of profile names
  targets: string[];            // list of target names for the active profile
  defaultTarget: string;        // value of `target:` key
  activeProfile: string;        // profile name used in dbt_project.yml
}

export async function GET(): Promise<NextResponse> {
  try {
    // Read dbt_project.yml to know the active profile name
    let activeProfile = '';
    try {
      const proj = await fs.readFile(path.join(DBT_ROOT, 'dbt_project.yml'), 'utf-8');
      const projParsed = yaml.parse(proj) as Record<string, unknown>;
      activeProfile = String(projParsed.profile ?? '');
    } catch { /* ignore */ }

    // Read profiles.yml
    const profilesPath = path.join(DBT_ROOT, 'profiles.yml');
    const raw = await fs.readFile(profilesPath, 'utf-8');
    const parsed = yaml.parse(raw) as Record<string, unknown>;

    const profiles = Object.keys(parsed).filter(k => k !== 'config');

    // Find the targets for the active profile (or first profile)
    const profileKey = activeProfile && parsed[activeProfile] ? activeProfile : profiles[0] ?? '';
    const profileData = parsed[profileKey] as Record<string, unknown> | undefined;
    const outputs = (profileData?.outputs ?? {}) as Record<string, unknown>;
    const targets = Object.keys(outputs);
    const defaultTarget = String(profileData?.target ?? targets[0] ?? 'dev');

    return NextResponse.json({
      profiles,
      targets,
      defaultTarget,
      activeProfile: profileKey,
    } satisfies ProfilesResponse);
  } catch (err) {
    // Graceful fallback — always return something usable
    return NextResponse.json({
      profiles: [],
      targets: ['dev'],
      defaultTarget: 'dev',
      activeProfile: '',
    } satisfies ProfilesResponse);
  }
}
