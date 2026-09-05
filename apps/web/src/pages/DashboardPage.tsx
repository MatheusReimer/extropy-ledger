import { useState } from 'react';
import { NativeSelect } from '@chakra-ui/react';
import { useAuth } from '../auth/AuthContext';
import { AppLayout, type ViewKey } from '../components';
import { CategoriesView } from '../views/CategoriesView';
import { OverviewView } from '../views/OverviewView';
import { useT } from '../i18n';
import { currentMonth, formatMonth, recentMonths } from '../lib/dates';

const MONTH_OPTIONS = recentMonths(12);

function greetingName(email: string | undefined): string {
  const local = email?.split('@')[0] ?? '';
  const word = local.split(/[._-]/)[0] ?? '';
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'there';
}

export function DashboardPage() {
  const t = useT();
  const { session, signOut } = useAuth();
  const [view, setView] = useState<ViewKey>('overview');
  const [month, setMonth] = useState(currentMonth);

  const monthPicker = (
    <NativeSelect.Root size="sm" width={{ base: 'full', sm: '44' }}>
      <NativeSelect.Field
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        aria-label={t('reports.month')}
        borderRadius="control"
      >
        {MONTH_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {formatMonth(option)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );

  const headings: Record<ViewKey, { title: string; subtitle: string }> = {
    overview: {
      title: t('nav.overview'),
      subtitle: t('overview.greeting', { name: greetingName(session?.user.email) }),
    },
    categories: { title: t('nav.categories'), subtitle: t('overview.categoriesSubtitle') },
  };

  return (
    <AppLayout
      view={view}
      onViewChange={setView}
      email={session?.user.email}
      onSignOut={signOut}
      title={headings[view].title}
      subtitle={headings[view].subtitle}
      action={monthPicker}
    >
      {view === 'overview' ? (
        <OverviewView month={month} onMonthChange={setMonth} />
      ) : (
        <CategoriesView month={month} />
      )}
    </AppLayout>
  );
}
