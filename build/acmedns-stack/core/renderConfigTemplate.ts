import { parse } from 'smol-toml'
import { envAcmednsTinyDomain, envAuthDomain, envApex } from './env'

export type ConfigTemplateProfile = 'production' | 'dev' | 'tiny'

const PROFILE_DEFAULTS: Record<ConfigTemplateProfile, { apex: string, authDomain: string }> = {
  production: { apex: 'example.org', authDomain: 'auth.example.org' },
  dev: { apex: 'example.test', authDomain: 'auth.example.test' },
  tiny: { apex: 'example.org', authDomain: 'auth.example.org' },
}

export type ConfigTemplateVars = {
  APEX: string
  AUTH_DOMAIN: string
  NSADMIN: string
}

/** Resolve ${APEX}, ${AUTH_DOMAIN}, and ${NSADMIN} for config.cfg.template rendering. */
export function resolveConfigTemplateVars(profile: ConfigTemplateProfile = 'production'): ConfigTemplateVars {
  const defaults = PROFILE_DEFAULTS[profile]
  const apex = envApex() ?? defaults.apex
  const tinyDomain = profile === 'tiny' ? envAcmednsTinyDomain() : undefined
  const authDomain = tinyDomain ?? envAuthDomain() ?? defaults.authDomain
  return {
    APEX: apex,
    AUTH_DOMAIN: authDomain,
    NSADMIN: `admin.${apex}`,
  }
}

export function configTemplateProfileFromPath(path: string): ConfigTemplateProfile {
  if (path.includes('config.dev.cfg')) {
    return 'dev'
  }
  if (path.includes('config.tiny.cfg')) {
    return 'tiny'
  }
  return 'production'
}

/** Map seed path or runtime default to the `.template` source file. */
export function configTemplatePathFor(seedPath: string): string {
  if (seedPath.endsWith('.template')) {
    return seedPath
  }
  return `${seedPath}.template`
}

/** Replace ${VAR} placeholders; unknown keys are left unchanged. */
export function renderConfigTemplate(
  template: string,
  profile: ConfigTemplateProfile = 'production',
): string {
  const vars = resolveConfigTemplateVars(profile)
  return template.replace(/\$\{([A-Z_]+)\}/g, (match, key: string) => {
    return key in vars ? vars[key as keyof ConfigTemplateVars] : match
  })
}

/** Render template, validate TOML, return live config text. */
export function renderConfigTemplateValidated(
  template: string,
  profile: ConfigTemplateProfile = 'production',
): string {
  const rendered = renderConfigTemplate(template, profile)
  parse(rendered)
  return rendered
}
