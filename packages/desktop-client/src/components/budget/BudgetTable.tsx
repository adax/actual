import React, {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  useState,
} from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  type CategoryEntity,
  type CategoryGroupEntity,
} from 'loot-core/types/models';

import { useCategories } from '../../hooks/useCategories';
import { useGlobalPref } from '../../hooks/useGlobalPref';
import { useLocalPref } from '../../hooks/useLocalPref';
import { type DropPosition } from '../sort';

import { BudgetCategories } from './BudgetCategories';
import { BudgetSummaries } from './BudgetSummaries';
import { BudgetTotals } from './BudgetTotals';
import { type MonthBounds, MonthsProvider } from './MonthsContext';
import {
  findSortDown,
  findSortUp,
  getScrollbarWidth,
  separateGroups,
} from './util';

type BudgetTableProps = {
  type: string;
  prewarmStartMonth: string;
  startMonth: string;
  numMonths: number;
  monthBounds: MonthBounds;
  dataComponents: {
    SummaryComponent: ComponentPropsWithoutRef<
      typeof BudgetSummaries
    >['SummaryComponent'];
    BudgetTotalsComponent: ComponentPropsWithoutRef<
      typeof BudgetTotals
    >['MonthComponent'];
  };
  onSaveCategory: (category: CategoryEntity) => void;
  onDeleteCategory: (id: CategoryEntity['id']) => void;
  onSaveGroup: (group: CategoryGroupEntity) => void;
  onDeleteGroup: (id: CategoryGroupEntity['id']) => void;
  onApplyBudgetTemplatesInGroup: (groupId: CategoryGroupEntity['id']) => void;
  onReorderCategory: (params: {
    id: CategoryEntity['id'];
    groupId?: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
  }) => void;
  onReorderGroup: (params: {
    id: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
  }) => void;
  onShowActivity: (id: CategoryEntity['id'], month?: string) => void;
  onBudgetAction: (month: string, type: string, args: unknown) => void;
};

export function BudgetTable(props: BudgetTableProps) {
  const {
    type,
    prewarmStartMonth,
    startMonth,
    numMonths,
    monthBounds,
    dataComponents,
    onSaveCategory,
    onDeleteCategory,
    onSaveGroup,
    onDeleteGroup,
    onApplyBudgetTemplatesInGroup,
    onReorderCategory,
    onReorderGroup,
    onShowActivity,
    onBudgetAction,
  } = props;

  const { grouped: categoryGroups = [] } = useCategories();
  const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
    useLocalPref('budget.collapsed');
  const [showHiddenCategories, setShowHiddenCategoriesPef] = useLocalPref(
    'budget.showHiddenCategories',
  );
  const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
  const categoryExpandedState = categoryExpandedStatePref ?? 0;
  const [editing, setEditing] = useState<{ id: string; cell: string } | null>(
    null,
  );

  const onEditMonth = (id: string, month: string) => {
    setEditing(id ? { id, cell: month } : null);
  };

  const onEditName = (id: string) => {
    setEditing(id ? { id, cell: 'name' } : null);
  };

  const _onReorderCategory = (
    id: string,
    dropPos: DropPosition,
    targetId: string,
  ) => {
    const isGroup = !!categoryGroups.find(g => g.id === targetId);

    if (isGroup) {
      const { targetId: groupId } = findSortUp(
        categoryGroups,
        dropPos,
        targetId,
      );
      const group = categoryGroups.find(g => g.id === groupId);

      if (group) {
        const { categories = [] } = group;
        onReorderCategory({
          id,
          groupId: group.id,
          targetId:
            categories.length === 0 || dropPos === 'top'
              ? null
              : categories[0].id,
        });
      }
    } else {
      let targetGroup;

      for (const group of categoryGroups) {
        if (group.categories?.find(cat => cat.id === targetId)) {
          targetGroup = group;
          break;
        }
      }

      onReorderCategory({
        id,
        groupId: targetGroup?.id,
        ...findSortDown(targetGroup?.categories || [], dropPos, targetId),
      });
    }
  };

  const _onReorderGroup = (
    id: string,
    dropPos: DropPosition,
    targetId: string,
  ) => {
    const [expenseGroups] = separateGroups(categoryGroups); // exclude Income group from sortable groups to fix off-by-one error
    onReorderGroup({
      id,
      ...findSortDown(expenseGroups, dropPos, targetId),
    });
  };

  const moveVertically = (dir: 1 | -1) => {
    const flattened = categoryGroups.reduce(
      (all, group) => {
        if (collapsedGroupIds.includes(group.id)) {
          return all.concat({ id: group.id, isGroup: true });
        }
        return all.concat([
          { id: group.id, isGroup: true },
          ...(group?.categories || []),
        ]);
      },
      [] as Array<
        { id: CategoryGroupEntity['id']; isGroup: boolean } | CategoryEntity
      >,
    );

    if (editing) {
      const idx = flattened.findIndex(item => item.id === editing.id);
      let nextIdx = idx + dir;

      while (nextIdx >= 0 && nextIdx < flattened.length) {
        const next = flattened[nextIdx];

        if ('isGroup' in next && next.isGroup) {
          nextIdx += dir;
          continue;
        } else if (
          type === 'report' ||
          ('is_income' in next && !next.is_income)
        ) {
          onEditMonth(next.id, editing.cell);
          return;
        } else {
          break;
        }
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editing) {
      return null;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      moveVertically(e.shiftKey ? -1 : 1);
    }
  };

  const onCollapse = (collapsedIds: string[]) => {
    setCollapsedGroupIdsPref(collapsedIds);
  };

  const onToggleHiddenCategories = () => {
    setShowHiddenCategoriesPef(!showHiddenCategories);
  };

  const toggleHiddenCategories = () => {
    onToggleHiddenCategories();
  };

  const expandAllCategories = () => {
    onCollapse([]);
  };

  const collapseAllCategories = () => {
    onCollapse(categoryGroups.map(g => g.id));
  };

  return (
    <View
      data-testid="budget-table"
      style={{
        flex: 1,
        ...(styles.lightScrollbar && {
          '& ::-webkit-scrollbar': {
            backgroundColor: 'transparent',
          },
          '& ::-webkit-scrollbar-thumb:vertical': {
            backgroundColor: theme.tableHeaderBackground,
          },
        }),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          overflow: 'hidden',
          flexShrink: 0,
          // This is necessary to align with the table because the
          // table has this padding to allow the shadow to show
          paddingLeft: 5,
          paddingRight: 5 + getScrollbarWidth(),
        }}
      >
        <View style={{ width: 200 + 100 * categoryExpandedState }} />
        <MonthsProvider
          startMonth={prewarmStartMonth}
          numMonths={numMonths}
          monthBounds={monthBounds}
          type={type}
        >
          <BudgetSummaries SummaryComponent={dataComponents.SummaryComponent} />
        </MonthsProvider>
      </View>

      <MonthsProvider
        startMonth={startMonth}
        numMonths={numMonths}
        monthBounds={monthBounds}
        type={type}
      >
        <BudgetTotals
          MonthComponent={dataComponents.BudgetTotalsComponent}
          toggleHiddenCategories={toggleHiddenCategories}
          expandAllCategories={expandAllCategories}
          collapseAllCategories={collapseAllCategories}
        />
        <View
          style={{
            overflowY: 'scroll',
            overflowAnchor: 'none',
            flex: 1,
            paddingLeft: 5,
            paddingRight: 5,
          }}
        >
          <View
            style={{
              flexShrink: 0,
            }}
            onKeyDown={onKeyDown}
          >
            <BudgetCategories
              // @ts-expect-error Fix when migrating BudgetCategories to ts
              categoryGroups={categoryGroups}
              editingCell={editing}
              dataComponents={dataComponents}
              onEditMonth={onEditMonth}
              onEditName={onEditName}
              onSaveCategory={onSaveCategory}
              onSaveGroup={onSaveGroup}
              onDeleteCategory={onDeleteCategory}
              onDeleteGroup={onDeleteGroup}
              onReorderCategory={_onReorderCategory}
              onReorderGroup={_onReorderGroup}
              onBudgetAction={onBudgetAction}
              onShowActivity={onShowActivity}
              onApplyBudgetTemplatesInGroup={onApplyBudgetTemplatesInGroup}
            />
          </View>
        </View>
      </MonthsProvider>
    </View>
  );
}

BudgetTable.displayName = 'BudgetTable';
