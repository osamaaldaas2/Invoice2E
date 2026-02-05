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
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {title}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                        {value}
                    </p>
                    {subtitle && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {subtitle}
                        </p>
                    )}
                    {change && (
                        <p
                            className={`mt-2 text-sm font-medium ${
                                changeType === 'positive'
                                    ? 'text-green-600'
                                    : changeType === 'negative'
                                    ? 'text-red-600'
                                    : 'text-gray-500'
                            }`}
                        >
                            {change}
                        </p>
                    )}
                </div>
                {icon && (
                    <div
                        className={`flex items-center justify-center w-12 h-12 rounded-lg ${colorClasses[color]}`}
                    >
                        <span className="text-2xl">{icon}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
