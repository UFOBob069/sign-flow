import type { AppSettings, CommunicationTemplates, SupportedLanguage } from "@/types/models";
import { buildBrandedEmailHtml, getEmailAssetBaseUrl, splitEmailBodyAroundUrl } from "@/lib/email-html-layout";
import { templateForLanguage } from "@/lib/message-language";

/** Default when `firmName` is absent in stored settings (legacy rows). */
export const FIRM = "Ramos James Law";

export const DEFAULT_COMMUNICATION_TEMPLATES: CommunicationTemplates = {
  firmName: FIRM,
  firmLogoUrl: "",
  signingSmsTemplate:
    "Hi {{clientName}}, this is {{firm}}. Please review and sign your documents here: {{url}}. Reply STOP to stop reminder texts (your signing link stays active).",
  signingEmailSubjectTemplate: "Documents to Review and Sign",
  signingEmailBodyTemplate: `Hi {{clientName}},

Please review and sign your documents using the button in this email.

If you have questions, contact {{firm}}.

Thank you.

{{url}}`,
  emailHtmlFooterTemplate: `{{firm}}

Need help? Reply to this email or contact your attorney directly.`,
  reminderSmsTemplate:
    "Reminder from {{firm}} for {{clientName}}: please complete your documents here: {{url}}. Reply STOP to stop reminder texts (your signing link stays active).",
  reminderEmailSubjectTemplate: "Reminder: documents awaiting your signature",
  reminderEmailBodyTemplate: `Hi {{clientName}},

This is a friendly reminder to review and sign your documents — use the button in this email when you are ready.

{{url}}

— {{firm}}`,
  signingSmsTemplateEs:
    "Hola {{clientName}}, le escribimos de {{firm}}. Por favor revise y firme sus documentos aquí: {{url}}. Responda ALTO para detener recordatorios (el enlace sigue activo).",
  signingEmailSubjectTemplateEs: "Documentos para revisar y firmar",
  signingEmailBodyTemplateEs: `Hola {{clientName}},

Por favor revise y firme sus documentos usando el botón en este correo.

Si tiene preguntas, comuníquese con {{firm}}.

Gracias.

{{url}}`,
  emailHtmlFooterTemplateEs: `{{firm}}

¿Necesita ayuda? Responda a este correo o comuníquese con su abogado.`,
  reminderSmsTemplateEs:
    "Recordatorio de {{firm}} para {{clientName}}: complete sus documentos aquí: {{url}}. Responda ALTO para detener recordatorios (el enlace sigue activo).",
  reminderEmailSubjectTemplateEs: "Recordatorio: documentos pendientes de firma",
  reminderEmailBodyTemplateEs: `Hola {{clientName}},

Le recordamos amablemente que revise y firme sus documentos — use el botón en este correo cuando esté listo.

{{url}}

— {{firm}}`,
};

export function mergeCommunicationTemplates(settings: AppSettings | null): CommunicationTemplates {
  const o = settings?.communicationTemplates;
  if (!o) return { ...DEFAULT_COMMUNICATION_TEMPLATES };
  return {
    ...DEFAULT_COMMUNICATION_TEMPLATES,
    ...o,
  };
}

export function applyTemplateString(
  template: string,
  vars: {
    clientName: string;
    url?: string;
    firm?: string;
    templateName?: string;
    documentUrl?: string;
  },
): string {
  const firm = (vars.firm ?? FIRM).trim() || FIRM;
  return template
    .replaceAll("{{clientName}}", vars.clientName)
    .replaceAll("{{url}}", vars.url ?? "")
    .replaceAll("{{firm}}", firm)
    .replaceAll("{{templateName}}", vars.templateName ?? "")
    .replaceAll("{{documentUrl}}", vars.documentUrl ?? "");
}

export function signingSmsFromSettings(
  settings: AppSettings | null,
  clientName: string,
  url: string,
  language: SupportedLanguage = "en",
): string {
  const t = mergeCommunicationTemplates(settings);
  const template = templateForLanguage(language, t.signingSmsTemplate, t.signingSmsTemplateEs);
  return applyTemplateString(template, { clientName, url, firm: t.firmName });
}

export function signingEmailFromSettings(
  settings: AppSettings | null,
  clientName: string,
  url: string,
  language: SupportedLanguage = "en",
): { subject: string; text: string; html: string } {
  const t = mergeCommunicationTemplates(settings);
  const firm = t.firmName;
  const subject = applyTemplateString(
    templateForLanguage(language, t.signingEmailSubjectTemplate, t.signingEmailSubjectTemplateEs),
    { clientName, url, firm },
  );
  const text = applyTemplateString(
    templateForLanguage(language, t.signingEmailBodyTemplate, t.signingEmailBodyTemplateEs),
    { clientName, url, firm },
  );
  const { before, after } = splitEmailBodyAroundUrl(text, url);
  const footerPlain = applyTemplateString(
    templateForLanguage(language, t.emailHtmlFooterTemplate, t.emailHtmlFooterTemplateEs),
    { clientName, url, firm },
  );
  const html = buildBrandedEmailHtml({
    kind: "signing",
    beforeUrlPlain: before,
    afterUrlPlain: after,
    signingUrl: url,
    firm,
    firmLogoUrl: t.firmLogoUrl?.trim() || null,
    footerPlain,
    assetBaseUrl: getEmailAssetBaseUrl(),
  });
  return { subject, text, html };
}

export function reminderSmsFromSettings(
  settings: AppSettings | null,
  clientName: string,
  url: string,
  language: SupportedLanguage = "en",
): string {
  const t = mergeCommunicationTemplates(settings);
  const template = templateForLanguage(language, t.reminderSmsTemplate, t.reminderSmsTemplateEs);
  return applyTemplateString(template, { clientName, url, firm: t.firmName });
}

export function reminderEmailFromSettings(
  settings: AppSettings | null,
  clientName: string,
  url: string,
  language: SupportedLanguage = "en",
): { subject: string; text: string; html: string } {
  const t = mergeCommunicationTemplates(settings);
  const firm = t.firmName;
  const subject = applyTemplateString(
    templateForLanguage(language, t.reminderEmailSubjectTemplate, t.reminderEmailSubjectTemplateEs),
    { clientName, url, firm },
  );
  const text = applyTemplateString(
    templateForLanguage(language, t.reminderEmailBodyTemplate, t.reminderEmailBodyTemplateEs),
    { clientName, url, firm },
  );
  const { before, after } = splitEmailBodyAroundUrl(text, url);
  const footerPlain = applyTemplateString(
    templateForLanguage(language, t.emailHtmlFooterTemplate, t.emailHtmlFooterTemplateEs),
    { clientName, url, firm },
  );
  const html = buildBrandedEmailHtml({
    kind: "reminder",
    beforeUrlPlain: before,
    afterUrlPlain: after,
    signingUrl: url,
    firm,
    firmLogoUrl: t.firmLogoUrl?.trim() || null,
    footerPlain,
    assetBaseUrl: getEmailAssetBaseUrl(),
  });
  return { subject, text, html };
}
