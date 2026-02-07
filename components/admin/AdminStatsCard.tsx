'use client';

type AdminStatsCardProps = {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: string;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
};

const colorClasses = {
    blue: 'bg-sky-500/15 text-sky-200 border border-sky-400/30',
    green: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
    red: 'bg-rose-500/15 text-rose-200 border border-rose-400/30',
    yellow: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    purple: 'bg-violet-500/15 text-violet-200 border border-violet-400/30',
};

export default function AdminStatsCard({
    title,
    value,
    subtitle,
    icon,
    change,
    changeType = 'neutral',
    color = 'blue',
}: AdminStatsCardProps) {
    return (
        <div className="glass-card p-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-faded">
                        {title}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white font-display">
                        {value}
                    </p>
                    {subtitle && (
                        <p className="mt-1 text-sm text-faded">
                            {subtitle}
                        </p>
                    )}
                    {change && (
                        <p
                            className={`mt-2 text-sm font-medium ${
                                changeType === 'positive'
                                    ? 'text-emerald-300'
                                    : changeType === 'negative'
                                    ? 'text-rose-300'
                                    : 'text-faded'
                            }`}
                        >
                            {change}
                        </p>
                    )}
                </div>
                {icon && (
                    <div
                        className={`flex items-center justify-center w-12 h-12 rounded-xl ${colorClasses[color]}`}
                    >
                        <span className="text-2xl">{icon}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
