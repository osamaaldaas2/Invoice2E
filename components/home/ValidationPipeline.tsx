'use client';

import { useTranslations } from 'next-intl';

/**
 * Comprehensive validation pipeline component for homepage.
 * Shows 4 technical stages with detailed explanations.
 * Always-visible design for better information architecture.
 */
export default function ValidationPipeline() {
  const t = useTranslations('home');

  const steps = [
    {
      id: 1,
      icon: '📄',
      titleKey: 'step1Title',
      descKey: 'step1Desc',
      detailsKey: 'step1Details',
      exampleKey: 'step1Example',
      iconBg: 'from-sky-400/20 to-sky-600/20',
      borderColor: 'border-sky-400/30',
      textColor: 'text-sky-200',
    },
    {
      id: 2,
      icon: '✓',
      titleKey: 'step2Title',
      descKey: 'step2Desc',
      detailsKey: 'step2Details',
      exampleKey: 'step2Example',
      iconBg: 'from-violet-400/20 to-violet-600/20',
      borderColor: 'border-violet-400/30',
      textColor: 'text-violet-200',
    },
    {
      id: 3,
      icon: '⚙️',
      titleKey: 'step3Title',
      descKey: 'step3Desc',
      detailsKey: 'step3Details',
      exampleKey: 'step3Example',
      iconBg: 'from-emerald-400/20 to-emerald-600/20',
      borderColor: 'border-emerald-400/30',
      textColor: 'text-emerald-200',
    },
    {
      id: 4,
      icon: '🛡️',
      titleKey: 'step4Title',
      descKey: 'step4Desc',
      detailsKey: 'step4Details',
      exampleKey: 'step4Example',
      iconBg: 'from-amber-400/20 to-amber-600/20',
      borderColor: 'border-amber-400/30',
      textColor: 'text-amber-200',
    },
  ];

  return (
    <div className="space-y-6">
      {steps.map((step, index) => (
        <div key={step.id} className="relative">
          {/* Step Card */}
          <div
            className={`glass-card p-6 md:p-8 border ${step.borderColor} hover:shadow-[0_0_32px_rgba(56,189,248,0.1)] transition-all duration-500`}
          >
            <div className="flex items-start gap-6">
              {/* Icon */}
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br border ${step.iconBg} ${step.borderColor} shrink-0`}
              >
                {step.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`text-xs font-bold tracking-wider ${step.textColor} uppercase`}
                    >
                      {t('stepLabel')} {step.id}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-3 font-display">
                    {t(step.titleKey)}
                  </h3>
                  <p className="text-base text-slate-300 leading-relaxed mb-4">{t(step.descKey)}</p>
                </div>

                {/* Technical Details */}
                <div className="space-y-4">
                  {/* What Happens */}
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <h4
                      className={`text-sm font-semibold ${step.textColor} mb-2 uppercase tracking-wide`}
                    >
                      {t('whatHappens')}
                    </h4>
                    <p className="text-sm text-faded leading-relaxed">{t(step.detailsKey)}</p>
                  </div>

                  {/* Examples */}
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <h4
                      className={`text-sm font-semibold ${step.textColor} mb-2 uppercase tracking-wide`}
                    >
                      {t('technicalExample')}
                    </h4>
                    <p className="text-sm text-faded leading-relaxed font-mono">
                      {t(step.exampleKey)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step Number Badge */}
            <div
              className={`absolute -left-3 -top-3 w-10 h-10 rounded-full bg-gradient-to-br ${step.iconBg} border-2 ${step.borderColor} flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm`}
            >
              {step.id}
            </div>
          </div>

          {/* Connector */}
          {index < steps.length - 1 && (
            <div className="flex justify-center py-4">
              <div className="w-0.5 h-8 bg-gradient-to-b from-white/30 via-white/10 to-white/30 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/40" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
