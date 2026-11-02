/**
 * dsh-envhub — Client half (Web UI).
 *
 * 渲染两处：左侧栏全局图标（sidebar.panellist，id=envhub）与中央面板
 * （main，key=envhub）。真实环境变量由 Host 路由 /envhub/api 提供；
 * 本文件只负责展示、组织关系（分组/标签/备注）、复制与导出/导入的交互。
 *
 * 原则：不 require 任何 Harness Client 包、不写宿主 DOM；只用主题词元
 * --dsw-alias-* 着色，控件自绘以贴近宿主。
 */

window.__ModuleLoader__.load({
  id: 'dsh-envhub',
  factory(require) {
    'use strict';
    try {
      return build(require);
    } catch (error) {
      try { console.error('[envhub] factory failed, plugin disabled:', error && (error.stack || error.message)); } catch (ignored) { /* ignore */ }
      return { apply: function noop() {} };
    }
  },
});

function build(require) {
  var React = require('react');
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  var NS = 'dsh-envhub';
  var API = 'envhub/api';

  /* ------------------------------------------------------------------ */
  /* 文案                                                                */
  /* ------------------------------------------------------------------ */
  var ZH = {
    'nav': '环境变量管理器',
    'panel.title': '环境变量管理器',
    'panel.subtitle': '共 {count} 个变量 · {groups} 个组 · {tags} 个标签',
    'toolbar.search': '搜索变量名或值…',
    'toolbar.source': '来源',
    'toolbar.allSources': '全部来源',
    'toolbar.showValues': '显示值',
    'toolbar.hideValues': '隐藏值',
    'toolbar.refresh': '刷新',
    'toolbar.new': '新建变量',
    'toolbar.export': '导出',
    'toolbar.import': '导入',
    'toolbar.backups': '备份',
    'view.vars': '变量',
    'view.groups': '分组',
    'view.tags': '标签',
    'view.detail': '详细',
    'view.board': '看板',
    'view.dimGroup': '按分组',
    'view.dimTag': '按标签',
    'board.hint': '看板按当前筛选结果展示；点击卡片可编辑组织信息。',
    'board.copyKey': '复制本列 Key',
    'board.copyKV': '复制本列 Key 和 Value',
    'board.select': '选择本列',
    'board.unselect': '取消本列',
    'view.group': '按组',
    'view.tag': '按标签',
    'view.all': '全部',
    'src.process': '进程',
    'src.user': '用户级',
    'src.machine': '系统级',
    'group.ungrouped': '未分组',
    'group.untagged': '无标签',
    'card.count': '{count} 项',
    'card.copyGroup': '复制本组',
    'card.copyTag': '复制本标签',
    'card.addGroup': '新建组',
    'card.renameGroup': '重命名组',
    'row.copyName': '复制名称',
    'row.copyValue': '复制值',
    'row.edit': '编辑',
    'row.reveal': '显示值',
    'row.hide': '隐藏值',
    'row.select': '选择',
    'row.locked': '敏感值',
    'batch.selected': '已选 {count} 项',
    'batch.copyKey': '复制 Key',
    'batch.copyKV': '复制 Key 和 Value',
    'batch.setMeta': '批量设置分组/标签',
    'batch.selectAll': '全选',
    'batch.invert': '反选',
    'batch.clear': '清空选择',
    'shortcut.label': '打开/收起 环境变量管理器',
    'card.copyKey': 'Key',
    'card.copyKV': 'Key+值',
    'bulk.title': '批量设置分组与标签',
    'bulk.group': '设置分组',
    'bulk.keepGroup': '（不改变分组）',
    'bulk.noGroup': '（不分组）',
    'bulk.tags': '添加标签',
    'bulk.newTag': '新建标签…',
    'bulk.apply': '应用到 {count} 项',
    'bulk.cancel': '取消',
    'bulk.tagMode': '标签处理',
    'bulk.tagReplace': '覆盖为所选标签',
    'bulk.tagAppend': '追加到现有标签',
    'bulk.tagsHint': '「覆盖」会把所选变量的标签替换为上面勾选的标签；「追加」只新增、不移除。',
    'format.label': '格式',
    'format.kv': 'KEY=VALUE',
    'format.colon': 'KEY: VALUE',
    'format.export': 'export KEY="VALUE"',
    'format.name': '仅变量名',
    'format.json': 'JSON',
    'format.dotenv': '.env',
    'empty.title': '没有匹配的变量',
    'empty.body': '换个关键词，或切换「全部来源」再试。',
    'loading': '正在读取环境变量…',
    'error.load': '读取环境变量失败：{msg}',
    'unsupported': '当前平台不支持读写系统级环境变量，仅显示进程内变量。',
    'toast.copied': '已复制 {count} 项到剪贴板',
    'toast.copyFailed': '复制失败',
    'toast.saved': '已保存',
    'toast.saveFailed': '保存失败：{msg}',
    'toast.written': '已写入系统环境变量（需重启 DSH 或新开终端才生效）',
    'toast.writeFailed': '写入失败：{msg}',
    'toast.deleted': '已删除变量',
    'toast.imported': '导入完成：合并 {entries} 条关系，缺失 {missing}，写入 {written}',
    'meta.title': '组织信息',
    'meta.group': '所属分组',
    'meta.noGroup': '（不分组）',
    'meta.tags': '标签',
    'meta.note': '备注',
    'meta.pinned': '置顶',
    'meta.save': '保存',
    'meta.cancel': '取消',
    'meta.newTag': '新建标签…',
    'meta.newGroup': '新建组…',
    'group.new': '新建分组',
    'group.edit': '编辑分组',
    'tag.new': '新建标签',
    'tag.edit': '编辑标签',
    'gt.name': '名称',
    'gt.color': '颜色',
    'gt.none': '无色',
    'gt.save': '保存',
    'gt.delete': '删除',
    'gt.deleteGroupConfirm': '删除分组「{name}」？组内变量会变为未分组，变量本身不会被删除。',
    'gt.deleteTagConfirm': '删除标签「{name}」？该标签会从所有变量上移除。',
    'gt.moveUp': '上移',
    'gt.moveDown': '下移',
    'row.more': '更多操作',
    'row.copyKey': '复制 Key',
    'row.copyKV': '复制 Key 和 Value',
    'row.editMeta': '编辑组织信息',
    'row.editValue': '编辑值 / 删除',
    'row.delete': '删除变量',
    'vars.empty': '没有匹配的变量',
    'groups.empty': '还没有分组，点右上角「新建分组」。',
    'tags.empty': '还没有标签，点右上角「新建标签」。',
    'filter.group': '分组',
    'filter.tag': '标签',
    'filter.all': '全部',
    'filter.ungrouped': '未分组',
    'filter.untagged': '无标签',
    'filter.manage': '管理',
    'edit.title.new': '新建环境变量',
    'edit.title.edit': '修改变量',
    'edit.name': '变量名',
    'edit.value': '变量值',
    'edit.scope': '写入来源',
    'edit.scope.user': '用户级（HKCU）',
    'edit.scope.machine': '系统级（HKLM，需管理员）',
    'edit.warn': '将直接修改本机真实环境变量，写前会自动备份。',
    'edit.warnProtected': '这是受保护的系统变量，修改可能影响系统或开发环境。',
    'edit.save': '写入系统',
    'edit.delete': '删除变量',
    'edit.deleteConfirm': '确定删除 {name}？写前会备份，可在「备份」中恢复。',
    'edit.cancel': '取消',
    'export.title': '导出环境变量',
    'export.scope': '导出范围',
    'export.scope.all': '全部变量',
    'export.scope.selected': '仅已选（{count} 项）',
    'export.includeValues': '包含真实值（含密钥，注意保管）',
    'export.confirm': '导出并下载',
    'export.cancel': '取消',
    'import.title': '导入配置',
    'import.pick': '选择导出的 JSON 文件…',
    'import.preview': '将导入 {variables} 个变量、{groups} 组、{tags} 标签。',
    'import.mergeMode': '合并方式',
    'import.merge': '合并（保留本机现有关系）',
    'import.replace': '替换（以导入文件为准）',
    'import.writeValues': '同时把文件中的值写入本机',
    'import.confirm': '开始导入',
    'import.cancel': '取消',
    'import.result': '导入结果',
    'import.choose': '选择文件',
    'import.draghint': '仅支持本插件导出的 .json 文件',
    'import.statVars': '变量 {count}',
    'import.statGroups': '分组 {count}',
    'import.statTags': '标签 {count}',
    'import.writeWarn': '会把文件中的值写入本机环境变量（写前自动备份）。',
    'export.count': '将导出 {count} 个变量',
    'export.warnValues': '导出文件将包含真实密钥值，请妥善保管，勿分享。',
    'backups.title': '备份与恢复',
    'backups.empty': '暂无备份。',
    'backups.restore': '恢复',
    'backups.close': '关闭',
    'common.close': '关闭',
    'common.ok': '确定',
    'common.delete': '删除',
  };
  var EN = Object.assign({}, ZH, {
    'nav': 'Environment Variable Manager',
    'panel.title': 'Environment Variable Manager',
    'toolbar.search': 'Search name or value…',
    'toolbar.showValues': 'Show values',
    'toolbar.hideValues': 'Hide values',
    'toolbar.refresh': 'Refresh',
    'toolbar.new': 'New',
    'toolbar.export': 'Export',
    'toolbar.import': 'Import',
    'view.group': 'By group',
    'view.tag': 'By tag',
    'view.all': 'All',
    'group.ungrouped': 'Ungrouped',
    'group.untagged': 'Untagged',
  });

  var activeT = null;
  var panelVisible = false;
  function tt(key, vars) {
    var text;
    if (activeT) {
      try { var r = activeT(key, vars); if (r && r !== key) text = r; } catch (ignored) { /* ignore */ }
    }
    if (text == null) text = ZH[key] != null ? ZH[key] : key;
    if (vars) {
      text = String(text).replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] != null ? String(vars[name]) : m;
      });
    }
    return text;
  }

  /* ------------------------------------------------------------------ */
  /* API 与工具                                                          */
  /* ------------------------------------------------------------------ */
  function callApi(action, args) {
    var body = Object.assign({ action: action }, args || {});
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function copyText(text) {
    return Promise.resolve().then(function () {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
      return false;
    }).then(function (ok) {
      if (ok) return true;
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var done = document.execCommand('copy');
        document.body.removeChild(ta);
        return done;
      } catch (ignored) {
        return false;
      }
    });
  }

  function formatItems(items, includeValues, format) {
    var lines;
    if (format === 'json') {
      if (includeValues) {
        var obj = {};
        items.forEach(function (it) { obj[it.name] = it.value; });
        return JSON.stringify(obj, null, 2);
      }
      return JSON.stringify(items.map(function (it) { return it.name; }), null, 2);
    }
    lines = items.map(function (it) {
      if (!includeValues) {
        if (format === 'colon') return it.name + ':';
        if (format === 'export') return 'export ' + it.name;
        return it.name;
      }
      if (format === 'colon') return it.name + ': ' + it.value;
      if (format === 'export') return 'export ' + it.name + '="' + String(it.value).replace(/"/g, '\\"') + '"';
      return it.name + '=' + it.value;
    });
    return lines.join('\n');
  }

  function downloadText(filename, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (ignored) { /* ignore */ } }, 1500);
      return true;
    } catch (ignored) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 图标                                                                */
  /* ------------------------------------------------------------------ */
  function svg(paths, size, extra) {
    var props = {
      width: size || 16, height: size || 16, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      style: Object.assign({ display: 'block', flex: 'none' }, (extra && extra.style) || {}),
    };
    return h('svg', props, paths.map(function (d, i) {
      return typeof d === 'string'
        ? h('path', { key: i, d: d })
        : h(d.tag, Object.assign({ key: i }, d.attrs));
    }));
  }

  var ICONS = {
    eye: ['M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
    eyeOff: ['M3 3l18 18', 'M10.6 10.6a3 3 0 0 0 4.2 4.2', 'M9.9 5.2A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a17 17 0 0 1-3.2 3.9', 'M6.1 6.1A17 17 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 3.3-.5'],
    copy: ['M9 9h10v10H9z', 'M5 15V5h10'],
    lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
    plus: ['M12 5v14', 'M5 12h14'],
    refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
    download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    upload: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'],
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    pencil: ['M4 20l4-1 11-11-3-3L5 16z', 'M14 5l3 3'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    check: ['M4 12l5 5L20 6'],
    chevron: ['M8 10l4 4 4-4'],
    up: ['M6 15l6-6 6 6'],
    down: ['M6 9l6 6 6-6'],
    folder: ['M4 6h6l2 2h8v10H4z'],
    tag: ['M3 12l8-8h9v9l-8 8z', 'M8 8h.01'],
    history: ['M12 8v5l3 2', 'M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9z'],
    more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
  };

  function Icon(name, size, extra) {
    var paths = ICONS[name];
    if (!paths) return null;
    if (name === 'more') {
      return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, style: { display: 'block', flex: 'none' } },
        [6, 12, 18].map(function (x) { return h('circle', { key: x, cx: x, cy: 12, r: 1.6 }); }));
    }
    return svg(paths, size, extra);
  }

  /* ------------------------------------------------------------------ */
  /* 样式                                                                */
  /* ------------------------------------------------------------------ */
  function Checkbox(props) {
    var p = props || {};
    return h('label', { className: 'em-cb', style: p.style || null },
      h('input', { type: 'checkbox', checked: p.checked === true, disabled: p.disabled === true, onChange: function (e) { if (typeof p.onChange === 'function') p.onChange(e.target.checked); } }),
      h('span', { className: 'em-cb-box' }, Icon('check', 11)),
      p.label ? h('span', null, p.label) : null
    );
  }

  var CSS = ''
    + '.em-root{display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;}'
    + '.em-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);}'
    + '.em-title{font-size:15px;font-weight:600;margin:0 8px 0 0;}'
    + '.em-sub{color:var(--dsw-alias-label-secondary);font-size:12px;margin-right:auto;}'
    + '.em-search{flex:1 1 220px;min-width:160px;display:flex;align-items:center;gap:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 8px;}'
    + '.em-search input{flex:1;border:0;outline:0;background:transparent;color:inherit;font-size:13px;}'
    + '.em-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;}'
    + '.em-btn:hover{background:var(--dsw-alias-bg-layer-2);}'
    + '.em-btn:disabled{opacity:.5;cursor:not-allowed;}'
    + '.em-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}'
    + '.em-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}'
    + '.em-btn.icon{padding:5px;line-height:0;}'
    + '.em-tabs{display:flex;gap:4px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);}'
    + '.em-tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;}'
    + '.em-tab.active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1);}'
    + '.em-scroll{flex:1 1 0%;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 16px 24px;}'
    + '.em-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;}'
    + '.em-card-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}'
    + '.em-card-name{font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;}'
    + '.em-card-count{color:var(--dsw-alias-label-secondary);font-size:12px;}'
    + '.em-dot{width:9px;height:9px;border-radius:50%;flex:none;}'
    + '.em-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l1);}'
    + '.em-row:first-child{border-top:0;}'
    + '.em-row:hover{background:var(--dsw-alias-bg-layer-2);}'
    + '.em-check{flex:none;width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;}'
    + '.em-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;}'
    + '.em-val{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:80px;}'
    + '.em-badges{display:flex;gap:4px;flex:none;}'
    + '.em-badge{font-size:10.5px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}'
    + '.em-badge.process{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);}'
    + '.em-badge.user{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}'
    + '.em-badge.machine{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);}'
    + '.em-tag{font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);}'
    + '.em-row-actions{display:flex;gap:2px;flex:none;opacity:.55;}'
    + '.em-row:hover .em-row-actions{opacity:1;}'
    + '.em-card-head{flex-wrap:wrap;row-gap:6px;}'
    + '.em-head-actions{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;}'
    + '.em-rowmenu{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;background:var(--dsw-alias-bg-base);border-top:1px dashed var(--dsw-alias-border-l2);}'
    + '.em-swatches{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}'
    + '.em-swatch{width:22px;height:22px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);cursor:pointer;padding:0;}'
    + '.em-swatch.on{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}'
    + '.em-swatch.none{background:linear-gradient(135deg,transparent 45%,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-state-error-primary) 55%,transparent 55%);}'
    + '.em-filters{display:flex;flex-direction:column;gap:6px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);}'
    + '.em-frow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}'
    + '.em-flabel{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary);flex:none;min-width:46px;}'
    + '.em-fchips{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:120px;}'
    + '.em-fchip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;}'
    + '.em-fchip:hover{background:var(--dsw-alias-bg-layer-2);}'
    + '.em-fchip.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}'
    + '.em-fcount{font-size:11px;color:var(--dsw-alias-label-secondary);}'
    + '.em-fchip.on .em-fcount{color:#fff;opacity:.85;}'
    + '.em-fname{max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.em-cb{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:13px;line-height:1.2;}'
    + '.em-cb input{position:absolute;opacity:0;width:0;height:0;}'
    + '.em-cb-box{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;justify-content:center;color:transparent;background:var(--dsw-alias-bg-base);flex:none;transition:background .12s,border-color .12s;}'
    + '.em-cb input:checked + .em-cb-box{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}'
    + '.em-cb input:focus-visible + .em-cb-box{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}'
    + '.em-upload{display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 16px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);text-align:center;}'
    + '.em-upload-icon{color:var(--dsw-alias-label-secondary);opacity:.8;}'
    + '.em-upload-title{font-size:13px;font-weight:600;}'
    + '.em-file{display:inline-flex;}'
    + '.em-file input{position:absolute;opacity:0;width:0;height:0;}'
    + '.em-warnbox{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--dsw-alias-state-warn-primary);border:1px solid var(--dsw-alias-state-warn-primary);border-radius:8px;padding:8px 10px;line-height:1.5;}'
    + '.em-statline{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;}'
    + '.em-stat{padding:2px 10px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);}'
    + '.em-stat b{color:var(--dsw-alias-label-primary);font-weight:600;}'
    + '.em-viewbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);}'
    + '.em-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;}'
    + '.em-seg-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 12px;cursor:pointer;}'
    + '.em-seg-btn.on{background:var(--dsw-alias-brand-primary);color:#fff;}'
    + '.em-board{display:flex;gap:12px;align-items:flex-start;padding-bottom:8px;}'
    + '.em-kcol{flex:0 0 264px;max-width:264px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;}'
    + '.em-kcol-head{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:12px 12px 0 0;}'
    + '.em-kcol-name{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.em-kcol-count{color:var(--dsw-alias-label-secondary);font-size:12px;margin-left:auto;}'
    + '.em-kcol-actions{display:flex;gap:2px;align-items:center;flex:none;}'
    + '.em-kcol-body{display:flex;flex-direction:column;gap:8px;padding:8px;}'
    + '.em-kcol-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:14px;text-align:center;}'
    + '.em-kcard{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);padding:8px 10px;cursor:pointer;}'
    + '.em-kcard:hover{background:var(--dsw-alias-bg-layer-2);}'
    + '.em-kcard-top{display:flex;align-items:center;gap:6px;}'
    + '.em-kcard-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}'
    + '.em-icon-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:3px;border-radius:6px;cursor:pointer;line-height:0;}'
    + '.em-icon-btn:hover{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}'
    + '.em-batch{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}'
    + '.em-actionbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}'
    + '.em-empty{padding:36px 16px;text-align:center;color:var(--dsw-alias-label-secondary);}'
    + '.em-empty b{color:var(--dsw-alias-label-primary);display:block;margin-bottom:6px;}'
    + '.em-select,.em-input,.em-textarea{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-primary);padding:6px 9px;font-size:13px;outline:none;}'
    + '.em-textarea{resize:vertical;min-height:52px;font-family:inherit;}'
    + '.em-input.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}'
    + '.em-overlay{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;z-index:9999;}'
    + '.em-dialog{width:min(560px,92vw);max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);}'
    + '.em-dialog-head{display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);font-weight:600;font-size:14px;}'
    + '.em-dialog-head .em-icon-btn{margin-left:auto;}'
    + '.em-dialog-body{padding:16px;display:flex;flex-direction:column;gap:12px;}'
    + '.em-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1);}'
    + '.em-field{display:flex;flex-direction:column;gap:5px;}'
    + '.em-field>span{font-size:12px;color:var(--dsw-alias-label-secondary);}'
    + '.em-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);}'
    + '.em-warn{font-size:12px;color:var(--dsw-alias-state-warn-primary);}'
    + '.em-chips{display:flex;flex-wrap:wrap;gap:6px;}'
    + '.em-chip{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;}'
    + '.em-chip.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}'
    + '.em-inline{display:flex;gap:6px;align-items:center;}'
    + '.em-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);padding:9px 16px;border-radius:10px;font-size:12.5px;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:80vw;}'
    + '.em-toast.error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}'
    + '.em-list-line{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px dashed var(--dsw-alias-border-l1);}'
    + '.em-scroll::-webkit-scrollbar{width:8px;}.em-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:8px;}';

  /* ------------------------------------------------------------------ */
  /* 侧栏图标                                                            */
  /* ------------------------------------------------------------------ */
  function SidebarIcon(props) {
    var size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 18;
    var active = props && props.active === true;
    return h('span', {
      'aria-hidden': true,
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flex: 'none', opacity: active ? 1 : 0.7 },
    }, h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('rect', { x: 3.5, y: 6, width: 17, height: 12, rx: 3.6 }),
      h('circle', { cx: 8.6, cy: 12, r: 1.25, fill: 'currentColor', stroke: 'none' }),
      h('path', { d: 'M13 10.4 H17.4' }),
      h('path', { d: 'M13 13.6 H15.8' })
    ));
  }

  /* ------------------------------------------------------------------ */
  /* 面板                                                                */
  /* ------------------------------------------------------------------ */
  function EnvManagerPanel() {
    var dataState = useState(null); var data = dataState[0]; var setData = dataState[1];
    var loadState = useState(true); var loading = loadState[0]; var setLoading = loadState[1];
    var errState = useState(null); var error = errState[0]; var setError = errState[1];
    var qState = useState(''); var query = qState[0]; var setQuery = qState[1];
    var showState = useState(false); var showValues = showState[0]; var setShowValues = showState[1];
    var srcState = useState('all'); var sourceFilter = srcState[0]; var setSourceFilter = srcState[1];
    var viewState = useState('vars'); var viewMode = viewState[0]; var setViewMode = viewState[1];
    var vkState = useState('detail'); var viewKind = vkState[0]; var setViewKind = vkState[1];
    var bdState = useState('group'); var boardDim = bdState[0]; var setBoardDim = bdState[1];
    var selState = useState({}); var selected = selState[0]; var setSelected = selState[1];
    var fmtState = useState('kv'); var format = fmtState[0]; var setFormat = fmtState[1];
    var incState = useState(false); var includeValues = incState[0]; // 复制是否带值改由按钮决定，保留状态仅兼容
    var toastState = useState(null); var toast = toastState[0]; var setToast = toastState[1];
    var dialogState = useState(null); var dialog = dialogState[0]; var setDialog = dialogState[1];
    var menuState = useState(null); var openMenu = menuState[0]; var setOpenMenu = menuState[1];
    var gfState = useState(null); var groupFilter = gfState[0]; var setGroupFilter = gfState[1];
    var tfState = useState([]); var tagFilters = tfState[0]; var setTagFilters = tfState[1];
    var scrollRef = useRef(null);
    var scrollHState = useState(null); var scrollH = scrollHState[0]; var setScrollH = scrollHState[1];

    function showToast(msg, isError) {
      setToast({ msg: msg, error: !!isError });
      setTimeout(function () { setToast(function (cur) { return cur && cur.msg === msg ? null : cur; }); }, 2600);
    }

    var load = useCallback(function () {
      setLoading(true); setError(null);
      callApi('list').then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || 'unknown');
        setData({ items: res.items || [], meta: res.meta || { groups: [], tags: [], entries: {} }, unsupported: res.unsupported === true });
        setLoading(false);
      }).catch(function (e) {
        setError(String((e && e.message) || e));
        setLoading(false);
      });
    }, []);
    useEffect(function () { load(); }, [load]);
    useEffect(function () { panelVisible = true; return function () { panelVisible = false; }; }, []);
    useEffect(function () {
      function calc() {
        try {
          var el = scrollRef.current;
          if (!el || typeof window === 'undefined') return;
          var top = el.getBoundingClientRect().top;
          var h = Math.max(200, Math.floor(window.innerHeight - top - 12));
          setScrollH(function (prev) { return Math.abs((prev || 0) - h) > 1 ? h : prev; });
        } catch (ignored) { /* ignore */ }
      }
      calc();
      var t1 = setTimeout(calc, 80);
      var t2 = setTimeout(calc, 400);
      window.addEventListener('resize', calc);
      return function () { window.removeEventListener('resize', calc); clearTimeout(t1); clearTimeout(t2); };
    }, [loading, data, groupFilter, tagFilters, sourceFilter, showValues]);

    var meta = (data && data.meta) || { groups: [], tags: [], entries: {} };
    var items = (data && data.items) || [];

    function entryOf(name) {
      return (meta.entries && meta.entries[name]) || null;
    }

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      return items.filter(function (it) {
        if (sourceFilter !== 'all' && it.sources.indexOf(sourceFilter) === -1) return false;
        var e = entryOf(it.name);
        if (groupFilter === '__none__') { if (e && e.group) return false; }
        else if (groupFilter) { if (!(e && e.group === groupFilter)) return false; }
        if (tagFilters && tagFilters.length) {
          var etags = (e && e.tags) || [];
          var hit = tagFilters.some(function (t) { return t === '__none__' ? etags.length === 0 : etags.indexOf(t) !== -1; });
          if (!hit) return false;
        }
        if (!q) return true;
        return it.name.toLowerCase().indexOf(q) !== -1 || (showValues && String(it.value).toLowerCase().indexOf(q) !== -1);
      });
    }, [items, query, sourceFilter, showValues, groupFilter, tagFilters, meta]);

    var selectedItems = useMemo(function () {
      return items.filter(function (it) { return selected[it.name] === true; });
    }, [items, selected]);

    function groupBuckets() {
      var groups = (meta.groups || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var buckets = groups.map(function (g) { return { id: g.id, name: g.name || g.id, color: g.color, items: [], real: true, kind: 'group' }; });
      var byId = {}; buckets.forEach(function (b) { byId[b.id] = b; });
      var ungrouped = { id: null, name: tt('group.ungrouped'), items: [], real: false, kind: 'group' };
      filtered.forEach(function (it) {
        var e = entryOf(it.name);
        var gid = e && e.group;
        if (gid && byId[gid]) byId[gid].items.push(it); else ungroupedialog.items.push(it);
      });
      buckets.push(ungrouped);
      return buckets;
    }

    function tagBuckets() {
      var tags = (meta.tags || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var buckets = tags.map(function (t) { return { id: t.id, name: t.name || t.id, color: t.color, items: [], real: true, kind: 'tag' }; });
      var byId = {}; buckets.forEach(function (b) { byId[b.id] = b; });
      var untagged = { id: null, name: tt('group.untagged'), items: [], real: false, kind: 'tag' };
      filtered.forEach(function (it) {
        var e = entryOf(it.name);
        var ts = (e && e.tags) || [];
        var hit = false;
        ts.forEach(function (tid) { if (byId[tid]) { byId[tid].items.push(it); hit = true; } });
        if (!hit) untaggedialog.items.push(it);
      });
      buckets.push(untagged);
      return buckets;
    }

    function saveMeta(nextMeta, okMsg) {
      return callApi('saveMeta', { meta: nextMeta }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || 'save failed');
        setData(function (cur) { return cur ? Object.assign({}, cur, { meta: res.meta || nextMeta }) : cur; });
        if (okMsg) showToast(okMsg);
        return true;
      }).catch(function (e) { showToast(tt('toast.saveFailed', { msg: String((e && e.message) || e) }), true); return false; });
    }

    function toggleSelect(name) {
      setSelected(function (cur) { var next = Object.assign({}, cur); if (next[name]) delete next[name]; else next[name] = true; return next; });
    }
    function selectMany(list, on) {
      setSelected(function (cur) {
        var next = Object.assign({}, cur);
        list.forEach(function (it) { if (on) next[it.name] = true; else delete next[it.name]; });
        return next;
      });
    }
    function selectedCount() { return Object.keys(selected).length; }

    function doCopy(list, withValues) {
      if (!list.length) return;
      var text = formatItems(list, withValues === true, format);
      copyText(text).then(function (ok) {
        if (ok) showToast(tt('toast.copied', { count: list.length }));
        else showToast(tt('toast.copyFailed'), true);
      });
    }

    function copyOne(it, withVal) {
      var text = formatItems([it], withVal === true, format);
      copyText(text).then(function (ok) { showToast(ok ? tt('toast.copied', { count: 1 }) : tt('toast.copyFailed'), !ok); });
    }

    /* ---------- 元数据编辑 ---------- */
    function openMetaEditor(item) {
      var e = entryOf(item.name) || { group: null, tags: [], note: '', pinned: false };
      setDialog({ type: 'meta', item: item, draft: { group: e.group || null, tags: (e.tags || []).slice(), note: e.note || '', pinned: e.pinned === true } });
    }
    function openValueEditor(item) {
      setDialog({ type: 'value', item: item, draft: { value: item ? item.value : '', scope: (item && pickScope(item)) || 'user', name: item ? item.name : '', isNew: !item } });
    }
    function pickScope(item) {
      if (item.sources.indexOf('user') !== -1) return 'user';
      if (item.sources.indexOf('machine') !== -1 && item.sources.indexOf('user') === -1) return 'machine';
      return 'user';
    }

    function applyMetaSave() {
      if (!dialog || dialog.type !== 'meta') return;
      var draft = dialog.draft;
      var next = JSON.parse(JSON.stringify(meta));
      next.entries = next.entries || {};
      next.entries[dialog.item.name] = { group: draft.group || null, tags: draft.tags.slice(), note: draft.note || '', pinned: draft.pinned === true, order: 0 };
      saveMeta(next, tt('toast.saved')).then(function (ok) { if (ok) setDialog(null); });
    }

    function applyValueSave() {
      if (!dialog || dialog.type !== 'value') return;
      var d = dialog.draft;
      if (!d.isNew) {
        if (!window.confirm(tt('edit.warn'))) return;
      }
      var args = d.isNew
        ? { action: 'setVar', name: d.name, value: d.value, scope: d.scope }
        : { action: 'setVar', name: dialog.item.name, value: d.value, scope: d.scope };
      if (d.isNew) {
        callApi('setVar', { name: d.name, value: d.value, scope: d.scope }).then(function (res) {
          if (res && res.ok) { setDialog(null); showToast(tt('toast.written')); load(); }
          else showToast(tt('toast.writeFailed', { msg: (res && res.message) || '' }), true);
        }).catch(function (e) { showToast(tt('toast.writeFailed', { msg: String((e && e.message) || e) }), true); });
      } else {
        callApi('setVar', { name: dialog.item.name, value: d.value, scope: d.scope }).then(function (res) {
          if (res && res.ok) { setDialog(null); showToast(tt('toast.written')); load(); }
          else showToast(tt('toast.writeFailed', { msg: (res && res.message) || '' }), true);
        }).catch(function (e) { showToast(tt('toast.writeFailed', { msg: String((e && e.message) || e) }), true); });
      }
    }

    function deleteVar(item) {
      if (!window.confirm(tt('edit.deleteConfirm', { name: item.name }))) return;
      callApi('unsetVar', { name: item.name, scope: pickScope(item), confirmProtected: item.protected === true }).then(function (res) {
        if (res && res.ok) { setDialog(null); showToast(tt('toast.deleted')); load(); }
        else showToast(tt('toast.writeFailed', { msg: (res && res.message) || '' }), true);
      }).catch(function (e) { showToast(tt('toast.writeFailed', { msg: String((e && e.message) || e) }), true); });
    }

    /* ---------- 导出 / 导入 / 备份 ---------- */
    function doExport(useSelected, withValues) {
      var chosen = useSelected ? selectedItems : filtered.length ? filtered : items;
      var variables = chosen.map(function (it) {
        var row = { name: it.name, scope: pickScope(it), kind: it.kind || null };
        if (withValues) row.value = it.value;
        return row;
      });
      var payload = {
        format: 'dsh-envhub', version: 1, exportedAt: new Date().toISOString(),
        includeValues: !!withValues, meta: meta, variables: variables,
      };
      var name = 'envhub-' + new Date().toISOString().slice(0, 10) + '.json';
      if (downloadText(name, JSON.stringify(payload, null, 2))) { setDialog(null); showToast(tt('toast.saved')); }
      else showToast(tt('toast.copyFailed'), true);
    }

    var importPayloadRef = { current: null };

    function onImportFile(ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(String(reader.result));
          if (payload.format !== 'dsh-envhub') throw new Error('format mismatch');
          importPayloadRef.current = payload;
          setDialog({ type: 'import', payload: payload, mergeMode: 'merge', writeValues: false });
        } catch (e) {
          showToast(tt('toast.saveFailed', { msg: 'invalid file' }), true);
        }
      };
      reader.readAsText(file);
    }

    function doImport() {
      if (!dialog || dialog.type !== 'import' || !dialog.payload) return;
      callApi('importApply', { payload: dialog.payload, mergeMode: dialog.mergeMode, writeValues: dialog.writeValues }).then(function (res) {
        if (res && res.ok) {
          var s = res.summary || {};
          showToast(tt('toast.imported', { entries: s.entries || 0, missing: (s.missing || []).length, written: (s.written || []).length }));
          setDialog(null); load();
        } else {
          showToast(tt('toast.saveFailed', { msg: (res && res.message) || '' }), true);
        }
      }).catch(function (e) { showToast(tt('toast.saveFailed', { msg: String((e && e.message) || e) }), true); });
    }

    /* ---------- 渲染片段 ---------- */
    function renderVarRow(it) {
      var e = entryOf(it.name);
      var tags = (e && e.tags) || [];
      var tagNames = tags.map(function (tid) { var t = (meta.tags || []).filter(function (x) { return x.id === tid; })[0]; return t ? (t.name || t.id) : tid; });
      var valueText = showValues ? (it.value === '' ? '∅' : it.value) : '••••••';
      var row = h('div', { className: 'em-row' },
        h('input', { className: 'em-check', type: 'checkbox', checked: selected[it.name] === true, onChange: function () { toggleSelect(it.name); }, 'aria-label': it.name }),
        h('span', { className: 'em-name', title: it.name }, it.name),
        it.sensitive ? h('span', { title: tt('row.locked'), style: { color: 'var(--dsw-alias-state-error-primary)', lineHeight: 0, flex: 'none' } }, Icon('lock', 13)) : null,
        h('span', { className: 'em-val', title: showValues ? it.value : '' }, valueText),
        h('span', { className: 'em-badges' }, it.sources.map(function (s) {
          return h('span', { key: s, className: 'em-badge ' + s, title: s }, tt('src.' + s));
        })),
        tagNames.length ? h('span', { className: 'em-badges' }, tagNames.map(function (n, i) { return h('span', { key: i, className: 'em-tag' }, n); })) : null,
        h('span', { className: 'em-row-actions' },
          h('button', { className: 'em-icon-btn', title: tt('row.more'), onClick: function () { setOpenMenu(openMenu === it.name ? null : it.name); } }, Icon('more', 14))
        )
      );
      if (openMenu !== it.name) return h('div', { key: it.name }, row);
      var menu = h('div', { className: 'em-rowmenu' },
        h('button', { className: 'em-btn', onClick: function () { copyOne(it, false); setOpenMenu(null); } }, Icon('copy', 13), tt('row.copyKey')),
        h('button', { className: 'em-btn', onClick: function () { copyOne(it, true); setOpenMenu(null); } }, Icon('copy', 13), tt('row.copyKV')),
        h('button', { className: 'em-btn', onClick: function () { setOpenMenu(null); openMetaEditor(it); } }, Icon('tag', 13), tt('row.editMeta')),
        h('button', { className: 'em-btn', onClick: function () { setOpenMenu(null); openValueEditor(it); } }, Icon('pencil', 13), tt('row.editValue')),
        h('button', { className: 'em-btn danger', onClick: function () { setOpenMenu(null); deleteVar(it); } }, Icon('trash', 13), tt('row.delete'))
      );
      return h('div', { key: it.name }, row, menu);
    }

    function renderCard(bucket) {
      var kind = bucket.kind;
      var allOn = bucket.items.length > 0 && bucket.items.every(function (it) { return selected[it.name] === true; });
      var isReal = bucket.real === true && bucket.id;
      return h('div', { key: (kind || 'g') + ':' + String(bucket.id), className: 'em-card' },
        h('div', { className: 'em-card-head' },
          bucket.color ? h('span', { className: 'em-dot', style: { background: bucket.color } }) : null,
          h('span', { className: 'em-card-name' }, kind === 'tag' ? Icon('tag', 13) : Icon('folder', 13), bucket.name),
          h('span', { className: 'em-card-count' }, tt('card.count', { count: bucket.items.length })),
          h('span', { className: 'em-head-actions' },
            isReal ? h('button', { className: 'em-btn icon', title: kind === 'group' ? tt('group.edit') : tt('tag.edit'), onClick: function () { openGroupTagEdit(kind, { id: bucket.id, name: bucket.name, color: bucket.color }); } }, Icon('pencil', 13)) : null,
            isReal ? h('button', { className: 'em-btn icon', title: tt('gt.moveUp'), onClick: function () { moveGroupTag(kind, bucket.id, -1); } }, Icon('up', 13)) : null,
            isReal ? h('button', { className: 'em-btn icon', title: tt('gt.moveDown'), onClick: function () { moveGroupTag(kind, bucket.id, 1); } }, Icon('down', 13)) : null,
            h('button', { className: 'em-btn', disabled: bucket.items.length === 0, title: tt('batch.copyKey'), onClick: function () { doCopy(bucket.items, false); } }, Icon('copy', 13), tt('card.copyKey')),
            h('button', { className: 'em-btn', disabled: bucket.items.length === 0, title: tt('batch.copyKV'), onClick: function () { doCopy(bucket.items, true); } }, Icon('copy', 13), tt('card.copyKV')),
            h('button', { className: 'em-btn icon', title: allOn ? tt('batch.clear') : tt('row.select'), onClick: function () { selectMany(bucket.items, !allOn); } }, Icon(allOn ? 'check' : 'plus', 13))
          )
        ),
        bucket.items.length ? bucket.items.map(renderVarRow) : h('div', { className: 'em-empty', style: { padding: '14px' } }, tt('empty.title'))
      );
    }

    function renderVarsCard() {
      return h('div', { className: 'em-card' },
        h('div', { className: 'em-card-head' },
          h('span', { className: 'em-card-name' }, tt('view.vars')),
          h('span', { className: 'em-card-count' }, tt('card.count', { count: filtered.length }))
        ),
        filtered.map(renderVarRow)
      );
    }

    function groupFacets() {
      var groups = (meta.groups || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      return groups.map(function (g) {
        var n = 0; items.forEach(function (it) { var e = entryOf(it.name); if (e && e.group === g.id) n += 1; });
        return { id: g.id, name: g.name || g.id, color: g.color, count: n };
      });
    }

    function tagFacets() {
      var tags = (meta.tags || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      return tags.map(function (t) {
        var n = 0; items.forEach(function (it) { var e = entryOf(it.name); if (e && (e.tags || []).indexOf(t.id) !== -1) n += 1; });
        return { id: t.id, name: t.name || t.id, color: t.color, count: n };
      });
    }

    function ungroupedCount() { var n = 0; items.forEach(function (it) { var e = entryOf(it.name); if (!(e && e.group)) n += 1; }); return n; }
    function untaggedCount() { var n = 0; items.forEach(function (it) { var e = entryOf(it.name); if (!(e && (e.tags || []).length)) n += 1; }); return n; }

    function filterChip(id, label, count, on, onClick, color) {
      return h('button', { key: id, className: 'em-fchip' + (on ? ' on' : ''), title: label, onClick: onClick },
        color ? h('span', { className: 'em-dot', style: { background: color } }) : null,
        h('span', { className: 'em-fname' }, label),
        h('span', { className: 'em-fcount' }, count));
    }

    function filterRow(kind, label, chips) {
      return h('div', { className: 'em-frow' },
        h('span', { className: 'em-flabel' }, kind === 'group' ? Icon('folder', 13) : Icon('tag', 13), label),
        h('div', { className: 'em-fchips' }, chips),
        h('button', { className: 'em-btn icon', title: kind === 'group' ? tt('group.new') : tt('tag.new'), onClick: function () { openGroupTagEdit(kind, null); } }, Icon('plus', 13)),
        h('button', { className: 'em-btn', onClick: function () { setDialog({ type: 'manage', kind: kind }); } }, tt('filter.manage'))
      );
    }

    function toggleTag(id) {
      setTagFilters(function (cur) { var arr = (cur || []).slice(); var i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); return arr; });
    }

    function renderFilters() {
      var gFacets = groupFacets(), tFacets = tagFacets();
      var gChips = [filterChip('__all', tt('filter.all'), items.length, !groupFilter, function () { setGroupFilter(null); })];
      gFacets.forEach(function (f) { gChips.push(filterChip(f.id, f.name, f.count, groupFilter === f.id, function () { setGroupFilter(groupFilter === f.id ? null : f.id); }, f.color)); });
      var gNone = ungroupedCount();
      if (gNone > 0 || groupFilter === '__none__') gChips.push(filterChip('__none__', tt('filter.ungrouped'), gNone, groupFilter === '__none__', function () { setGroupFilter(groupFilter === '__none__' ? null : '__none__'); }));
      var tChips = [filterChip('__all', tt('filter.all'), items.length, !tagFilters.length, function () { setTagFilters([]); })];
      tFacets.forEach(function (f) { tChips.push(filterChip(f.id, f.name, f.count, tagFilters.indexOf(f.id) !== -1, function () { toggleTag(f.id); }, f.color)); });
      var tNone = untaggedCount();
      if (tNone > 0 || tagFilters.indexOf('__none__') !== -1) tChips.push(filterChip('__none__', tt('filter.untagged'), tNone, tagFilters.indexOf('__none__') !== -1, function () { toggleTag('__none__'); }));
      return h('div', { className: 'em-filters' },
        filterRow('group', tt('filter.group'), gChips),
        filterRow('tag', tt('filter.tag'), tChips)
      );
    }

    function renderActionBar() {
      var n = selectedCount();
      var allOn = filtered.length > 0 && filtered.every(function (it) { return selected[it.name] === true; });
      return h('div', { className: 'em-actionbar' },
        h('span', { className: 'em-card-count' }, tt('batch.selected', { count: n })),
        h('button', { className: 'em-btn primary', disabled: n === 0, onClick: function () { doCopy(selectedItems, false); } }, Icon('copy', 13), tt('batch.copyKey')),
        h('button', { className: 'em-btn primary', disabled: n === 0, onClick: function () { doCopy(selectedItems, true); } }, Icon('copy', 13), tt('batch.copyKV')),
        h('button', { className: 'em-btn', disabled: n === 0, onClick: function () { openBulkMeta(); } }, Icon('tag', 13), tt('batch.setMeta')),
        h('span', { style: { flex: '1' } }),
        h('button', { className: 'em-btn', disabled: filtered.length === 0, onClick: function () { selectMany(filtered, !allOn); } }, tt('batch.selectAll')),
        h('button', { className: 'em-btn', disabled: filtered.length === 0, onClick: function () { setSelected(function (cur) { var next = Object.assign({}, cur); filtered.forEach(function (it) { if (next[it.name]) delete next[it.name]; else next[it.name] = true; }); return next; }); } }, tt('batch.invert')),
        h('button', { className: 'em-btn', disabled: n === 0, onClick: function () { setSelected({}); } }, tt('batch.clear')),
        h('label', { className: 'em-inline' }, tt('format.label'), h('select', { className: 'em-select', style: { width: 'auto' }, value: format, onChange: function (e) { setFormat(e.target.value); } },
          ['kv', 'colon', 'export', 'name', 'json', 'dotenv'].map(function (f) { return h('option', { key: f, value: f }, tt('format.' + f)); })
        ))
      );
    }

    function renderViewBar() {
      function segBtn(on, label, onClick) { return h('button', { className: 'em-seg-btn' + (on ? ' on' : ''), onClick: onClick }, label); }
      return h('div', { className: 'em-viewbar' },
        h('span', { className: 'em-seg' },
          segBtn(viewKind === 'detail', tt('view.detail'), function () { setViewKind('detail'); }),
          segBtn(viewKind === 'board', tt('view.board'), function () { setViewKind('board'); })),
        viewKind === 'board' ? h('span', { className: 'em-seg', style: { marginLeft: '8px' } },
          segBtn(boardDim === 'group', tt('view.dimGroup'), function () { setBoardDim('group'); }),
          segBtn(boardDim === 'tag', tt('view.dimTag'), function () { setBoardDim('tag'); })) : null,
        h('span', { style: { flex: '1' } }),
        viewKind === 'board' ? h('span', { className: 'em-hint' }, tt('board.hint')) : null
      );
    }

    function boardColumns() {
      if (boardDim === 'tag') {
        var tags = (meta.tags || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var cols = tags.map(function (t) { return { id: t.id, name: t.name || t.id, color: t.color, items: [] }; });
        var byId = {}; cols.forEach(function (c) { byId[c.id] = c; });
        var untagged = { id: null, name: tt('group.untagged'), color: null, items: [] };
        filtered.forEach(function (it) {
          var e = entryOf(it.name);
          var ts = (e && e.tags) || [];
          var hit = false;
          ts.forEach(function (tid) { if (byId[tid]) { byId[tid].items.push(it); hit = true; } });
          if (!hit) untagged.items.push(it);
        });
        if (untagged.items.length) cols.push(untagged);
        return cols;
      }
      var groups = (meta.groups || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var gcols = groups.map(function (g) { return { id: g.id, name: g.name || g.id, color: g.color, items: [] }; });
      var gById = {}; gcols.forEach(function (c) { gById[c.id] = c; });
      var ungrouped = { id: null, name: tt('group.ungrouped'), color: null, items: [] };
      filtered.forEach(function (it) {
        var e = entryOf(it.name);
        var gid = e && e.group;
        if (gid && gById[gid]) gById[gid].items.push(it); else ungrouped.items.push(it);
      });
      if (ungrouped.items.length || !groups.length) gcols.push(ungrouped);
      return gcols;
    }

    function renderKCard(it) {
      var e = entryOf(it.name);
      var tags = (e && e.tags) || [];
      var tagNames = tags.map(function (tid) { var t = (meta.tags || []).filter(function (x) { return x.id === tid; })[0]; return t ? (t.name || t.id) : null; }).filter(Boolean);
      return h('div', { key: it.name, className: 'em-kcard', title: tt('row.editMeta'), onClick: function () { openMetaEditor(it); } },
        h('div', { className: 'em-kcard-top' },
          h('span', { className: 'em-name', title: it.name }, it.name),
          it.sensitive ? h('span', { title: tt('row.locked'), style: { color: 'var(--dsw-alias-state-error-primary)', lineHeight: 0, flex: 'none' } }, Icon('lock', 13)) : null),
        h('div', { className: 'em-kcard-meta' },
          h('span', { className: 'em-badges' }, it.sources.map(function (s) { return h('span', { key: s, className: 'em-badge ' + s, title: s }, tt('src.' + s)); })),
          tagNames.length ? h('span', { className: 'em-badges' }, tagNames.map(function (n, i) { return h('span', { key: i, className: 'em-tag' }, n); })) : null)
      );
    }

    function renderBoard() {
      var cols = boardColumns();
      if (!cols.length) return h('div', { className: 'em-empty' }, h('b', null, boardDim === 'group' ? tt('groups.empty') : tt('tags.empty')));
      return h('div', { className: 'em-board' }, cols.map(function (c) {
        var allOn = c.items.length > 0 && c.items.every(function (it) { return selected[it.name] === true; });
        return h('div', { key: c.id === null ? '__none__' : c.id, className: 'em-kcol' },
          h('div', { className: 'em-kcol-head' },
            c.color ? h('span', { className: 'em-dot', style: { background: c.color } }) : null,
            h('span', { className: 'em-kcol-name' }, c.name),
            h('span', { className: 'em-kcol-count' }, c.items.length),
            h('span', { className: 'em-kcol-actions' },
              h('button', { className: 'em-icon-btn', title: tt('board.copyKey'), disabled: c.items.length === 0, onClick: function () { doCopy(c.items, false); } }, Icon('copy', 13)),
              h('button', { className: 'em-icon-btn', title: tt('board.copyKV'), disabled: c.items.length === 0, onClick: function () { doCopy(c.items, true); } }, Icon('copy', 13)),
              h('button', { className: 'em-icon-btn', title: allOn ? tt('board.unselect') : tt('board.select'), disabled: c.items.length === 0, onClick: function () { selectMany(c.items, !allOn); } }, Icon(allOn ? 'check' : 'plus', 13)))),
          h('div', { className: 'em-kcol-body' },
            c.items.length ? c.items.map(renderKCard) : h('div', { className: 'em-kcol-empty' }, tt('empty.title')))
        );
      }));
    }

    function renderBody() {
      if (loading) return h('div', { className: 'em-empty' }, tt('loading'));
      if (error) return h('div', { className: 'em-empty' }, h('b', null, tt('error.load', { msg: error })), h('button', { className: 'em-btn', onClick: load }, tt('toolbar.refresh')));
      if (!filtered.length) return h('div', { className: 'em-empty' }, h('b', null, tt('empty.title')), tt('empty.body'));
      if (viewKind === 'board') return renderBoard();
      return renderVarsCard();
    }

    var cnt = filtered.length;
    var subtitle = tt('panel.subtitle', { count: items.length, groups: (meta.groups || []).length, tags: (meta.tags || []).length });

    return h('div', { className: 'em-root' },
      h('div', { className: 'em-toolbar' },
        h('div', { style: { display: 'flex', flexDirection: 'column' } },
          h('span', { className: 'em-title' }, tt('panel.title')),
          h('span', { className: 'em-sub' }, subtitle)
        ),
        h('label', { className: 'em-search' }, Icon('tag', 14), h('input', { value: query, placeholder: tt('toolbar.search'), onChange: function (e) { setQuery(e.target.value); } })),
        h('select', { className: 'em-select', style: { width: 'auto' }, value: sourceFilter, onChange: function (e) { setSourceFilter(e.target.value); } },
          h('option', { value: 'all' }, tt('toolbar.allSources')),
          h('option', { value: 'process' }, tt('src.process')),
          h('option', { value: 'user' }, tt('src.user')),
          h('option', { value: 'machine' }, tt('src.machine'))
        ),
        h('button', { className: 'em-btn', onClick: function () { setShowValues(!showValues); } }, Icon(showValues ? 'eyeOff' : 'eye', 14), showValues ? tt('toolbar.hideValues') : tt('toolbar.showValues')),
        h('button', { className: 'em-btn icon', title: tt('toolbar.refresh'), onClick: load }, Icon('refresh', 15)),
        h('button', { className: 'em-btn primary', onClick: function () { openValueEditor(null); } }, Icon('plus', 14), tt('toolbar.new')),
        h('button', { className: 'em-btn', onClick: function () { setDialog({ type: 'export' }); } }, Icon('download', 14), tt('toolbar.export')),
        h('button', { className: 'em-btn', onClick: function () { setDialog({ type: 'importPick' }); } }, Icon('upload', 14), tt('toolbar.import')),
        h('button', { className: 'em-btn icon', title: tt('toolbar.backups'), onClick: function () { setDialog({ type: 'backups', items: null }); callApi('listBackups').then(function (r) { setDialog({ type: 'backups', items: (r && r.items) || [] }); }); } }, Icon('history', 15))
      ),
      renderViewBar(),
      renderFilters(),
      renderActionBar(),
      data && data.unsupported ? h('div', { className: 'em-hint', style: { padding: '0 16px 6px', color: 'var(--dsw-alias-state-warn-primary)' } }, tt('unsupported')) : null,
      h('div', { className: 'em-scroll', ref: scrollRef, style: scrollH ? { height: scrollH + 'px', maxHeight: scrollH + 'px' } : null }, renderBody()),
      dialog ? safeDialog() : null,
      toast ? h('div', { className: 'em-toast' + (toast.error ? ' error' : '') }, toast.msg) : null
    );

    /* ---------- 对话框 ---------- */
    function openGroupTagEdit(kind, item) {
      setDialog({ type: kind === 'group' ? 'groupEdit' : 'tagEdit', kind: kind, id: item ? item.id : null, name: item ? (item.name || '') : '', color: item ? item.color : null, isNew: !item });
    }

    function saveGroupTag(kind, d) {
      var name = (d.name || '').trim();
      if (!name) { showToast(tt('toast.saveFailed', { msg: tt('gt.name') }), true); return; }
      var next = JSON.parse(JSON.stringify(meta));
      var arr = kind === 'group' ? (next.groups = next.groups || []) : (next.tags = next.tags || []);
      var dup = arr.some(function (x) { return x.id !== d.id && (x.name || '').trim() === name; });
      if (dup) { showToast(tt('toast.saveFailed', { msg: name }), true); return; }
      if (d.id) {
        arr.forEach(function (x) { if (x.id === d.id) { x.name = name; x.color = d.color || null; } });
      } else {
        arr.push({ id: (kind === 'group' ? 'g' : 't') + Date.now().toString(36), name: name, color: d.color || null, order: arr.length });
      }
      saveMeta(next, tt('toast.saved')).then(function (ok) { if (ok) setDialog(null); });
    }

    function deleteGroupTag(kind, id) {
      if (kind === 'group' && groupFilter === id) setGroupFilter(null);
      if (kind === 'tag' && (tagFilters || []).indexOf(id) !== -1) setTagFilters(tagFilters.filter(function (x) { return x !== id; }));
      var next = JSON.parse(JSON.stringify(meta));
      next.entries = next.entries || {};
      if (kind === 'group') {
        next.groups = (next.groups || []).filter(function (g) { return g.id !== id; });
        Object.keys(next.entries).forEach(function (k) { if (next.entries[k] && next.entries[k].group === id) next.entries[k].group = null; });
      } else {
        next.tags = (next.tags || []).filter(function (t) { return t.id !== id; });
        Object.keys(next.entries).forEach(function (k) { var e = next.entries[k]; if (e && Array.isArray(e.tags)) e.tags = e.tags.filter(function (x) { return x !== id; }); });
      }
      saveMeta(next, tt('toast.saved')).then(function (ok) { if (ok) setDialog(null); });
    }

    function moveGroupTag(kind, id, dir) {
      var next = JSON.parse(JSON.stringify(meta));
      var arr = kind === 'group' ? (next.groups = next.groups || []) : (next.tags = next.tags || []);
      arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var i = -1; arr.forEach(function (x, idx) { if (x.id === id) i = idx; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      arr.forEach(function (x, idx) { x.order = idx; });
      saveMeta(next, null);
    }

    function renderManageDialog() {
      var kind = dialog.kind;
      var list = kind === 'group' ? groupFacets() : tagFacets();
      var body = [
        h('div', { className: 'em-inline', style: { justifyContent: 'flex-end' } },
          h('button', { className: 'em-btn primary', onClick: function () { openGroupTagEdit(kind, null); } }, Icon('plus', 13), kind === 'group' ? tt('group.new') : tt('tag.new')))
      ];
      if (!list.length) body.push(h('div', { className: 'em-empty' }, kind === 'group' ? tt('groups.empty') : tt('tags.empty')));
      list.forEach(function (f, idx) {
        body.push(h('div', { key: f.id, className: 'em-list-line' },
          h('span', { className: 'em-inline' }, f.color ? h('span', { className: 'em-dot', style: { background: f.color } }) : null, h('b', null, f.name), h('span', { className: 'em-hint' }, '  ' + f.count + ' 项')),
          h('span', { className: 'em-inline' },
            h('button', { className: 'em-btn icon', title: tt('gt.moveUp'), disabled: idx === 0, onClick: function () { moveGroupTag(kind, f.id, -1); } }, Icon('up', 13)),
            h('button', { className: 'em-btn icon', title: tt('gt.moveDown'), disabled: idx === list.length - 1, onClick: function () { moveGroupTag(kind, f.id, 1); } }, Icon('down', 13)),
            h('button', { className: 'em-btn icon', title: kind === 'group' ? tt('group.edit') : tt('tag.edit'), onClick: function () { openGroupTagEdit(kind, { id: f.id, name: f.name, color: f.color }); } }, Icon('pencil', 13)),
            h('button', { className: 'em-btn icon danger', title: tt('gt.delete'), onClick: function () { if (window.confirm(kind === 'group' ? tt('gt.deleteGroupConfirm', { name: f.name }) : tt('gt.deleteTagConfirm', { name: f.name }))) deleteGroupTag(kind, f.id); } }, Icon('trash', 13))
          )
        ));
      });
      return overlay(tt('filter.manage') + ' · ' + (kind === 'group' ? tt('filter.group') : tt('filter.tag')), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('common.close'))
      ]);
    }

    function renderGroupTagEdit() {
      var kind = dialog.kind;
      var d = dialog;
      function setDraft(patch) { setDialog(Object.assign({}, dialog, patch)); }
      var COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
      var body = [
        h('div', { className: 'em-field' }, h('span', null, tt('gt.name')),
          h('input', { className: 'em-input', value: d.name || '', autoFocus: true,
            onChange: function (e) { setDraft({ name: e.target.value }); },
            onKeyDown: function (e) { if (e.key === 'Enter') saveGroupTag(kind, d); } })),
        h('div', { className: 'em-field' }, h('span', null, tt('gt.color')),
          h('div', { className: 'em-swatches' },
            COLORS.map(function (c) { return h('button', { key: c, className: 'em-swatch' + (d.color === c ? ' on' : ''), style: { background: c }, title: c, onClick: function () { setDraft({ color: c }); } }); }),
            h('button', { className: 'em-swatch none' + (d.color == null ? ' on' : ''), title: tt('gt.none'), onClick: function () { setDraft({ color: null }); } })
          ))
      ];
      var foot = [h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('meta.cancel'))];
      if (!d.isNew) foot.push(h('button', { className: 'em-btn danger', onClick: function () { if (window.confirm(kind === 'group' ? tt('gt.deleteGroupConfirm', { name: d.name }) : tt('gt.deleteTagConfirm', { name: d.name }))) deleteGroupTag(kind, d.id); } }, Icon('trash', 13), tt('gt.delete')));
      foot.push(h('button', { className: 'em-btn primary', onClick: function () { saveGroupTag(kind, d); } }, tt('gt.save')));
      return overlay(kind === 'group' ? (d.isNew ? tt('group.new') : tt('group.edit')) : (d.isNew ? tt('tag.new') : tt('tag.edit')), body, foot);
    }

    function renderDialog() {
      if (dialog.type === 'meta') return renderMetaDialog();
      if (dialog.type === 'value') return renderValueDialog();
      if (dialog.type === 'export') return renderExportDialog();
      if (dialog.type === 'importPick') return renderImportPick();
      if (dialog.type === 'import') return renderImportDialog();
      if (dialog.type === 'backups') return renderBackups();
      if (dialog.type === 'rename') return renderRenameDialog();
      if (dialog.type === 'bulkMeta') return renderBulkMetaDialog();
      if (dialog.type === 'groupEdit' || dialog.type === 'tagEdit') return renderGroupTagEdit();
      if (dialog.type === 'manage') return renderManageDialog();
      return null;
    }

    function safeDialog() {
      try {
        return renderDialog();
      } catch (error) {
        try { console.error('[envhub] dialog render failed:', error && (error.stack || error.message)); } catch (ignored) { /* ignore */ }
        return h('div', { className: 'em-overlay' }, h('div', { className: 'em-dialog' },
          h('div', { className: 'em-dialog-body' }, 'Dialog error: ' + String((error && error.message) || error)),
          h('div', { className: 'em-dialog-foot' }, h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('common.close')))
        ));
      }
    }

    function renderRenameDialog() {
      var d = dialog;
      var body = [
        h('div', { className: 'em-field' }, h('span', null, tt('card.renameGroup')),
          h('input', { className: 'em-input', value: d.name || '', autoFocus: true,
            onChange: function (e) { setDialog(Object.assign({}, d, { name: e.target.value })); },
            onKeyDown: function (e) { if (e.key === 'Enter') { renameGroup(d.groupId, d.name); setDialog(null); } } })
        )
      ];
      return overlay(tt('card.renameGroup'), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('meta.cancel')),
        h('button', { className: 'em-btn primary', onClick: function () { renameGroup(d.groupId, d.name); setDialog(null); } }, tt('meta.save')),
      ]);
    }

    function openBulkMeta() {
      var common = null;
      selectedItems.forEach(function (it) {
        var e = entryOf(it.name);
        var ts = (e && e.tags) ? e.tags.slice() : [];
        if (common === null) common = ts;
        else common = common.filter(function (t) { return ts.indexOf(t) !== -1; });
      });
      setDialog({ type: 'bulkMeta', draft: { groupChange: false, group: null, tags: common || [], tagMode: 'replace' } });
    }

    function bulkMetaApply() {
      if (!dialog || dialog.type !== 'bulkMeta') return;
      var d = dialog.draft;
      var next = JSON.parse(JSON.stringify(meta));
      next.entries = next.entries || {};
      selectedItems.forEach(function (it) {
        var cur = next.entries[it.name] || { group: null, tags: [], note: '', pinned: false, order: 0 };
        if (d.groupChange) cur.group = d.group === undefined ? null : d.group;
        if (d.tagMode === 'append') {
          var set = {};
          (cur.tags || []).forEach(function (t) { set[t] = true; });
          (d.tags || []).forEach(function (t) { set[t] = true; });
          cur.tags = Object.keys(set);
        } else {
          cur.tags = (d.tags || []).slice();
        }
        next.entries[it.name] = cur;
      });
      saveMeta(next, tt('toast.saved')).then(function (ok) { if (ok) setDialog(null); });
    }

    function addBulkTag(name) {
      var id = 't' + Date.now().toString(36);
      var next = JSON.parse(JSON.stringify(meta));
      next.tags = (next.tags || []).concat([{ id: id, name: name, color: null }]);
      saveMeta(next).then(function () {
        setDialog(function (cur) { return cur && cur.type === 'bulkMeta' ? Object.assign({}, cur, { draft: Object.assign({}, cur.draft, { tags: cur.draft.tags.concat([id]) }) }) : cur; });
      });
    }

    function renderBulkMetaDialog() {
      var d = dialog.draft;
      var groups = meta.groups || [];
      var tags = meta.tags || [];
      function setDraft(patch) { setDialog(Object.assign({}, dialog, { draft: Object.assign({}, d, patch) })); }
      var groupValue = d.groupChange ? (d.group || '') : '__keep__';
      var body = [
        h('div', { className: 'em-field' }, h('span', null, tt('bulk.group')),
          h('select', { className: 'em-select', value: groupValue, onChange: function (e) {
            var v = e.target.value;
            if (v === '__keep__') setDraft({ groupChange: false });
            else if (v === '') setDraft({ groupChange: true, group: null });
            else setDraft({ groupChange: true, group: v });
          } },
            h('option', { value: '__keep__' }, tt('bulk.keepGroup')),
            h('option', { value: '' }, tt('bulk.noGroup')),
            groups.map(function (g) { return h('option', { key: g.id, value: g.id }, g.name || g.id); })
          )
        ),
        h('div', { className: 'em-field' }, h('span', null, tt('bulk.tagMode')),
          h('select', { className: 'em-select', value: d.tagMode || 'replace', onChange: function (e) { setDraft({ tagMode: e.target.value }); } },
            h('option', { value: 'replace' }, tt('bulk.tagReplace')),
            h('option', { value: 'append' }, tt('bulk.tagAppend'))
          )),
        h('div', { className: 'em-field' }, h('span', null, tt('bulk.tags')),
          h('div', { className: 'em-chips' }, tags.map(function (t) {
            var on = d.tags.indexOf(t.id) !== -1;
            return h('button', { key: t.id, className: 'em-chip' + (on ? ' on' : ''), onClick: function () { setDraft({ tags: on ? d.tags.filter(function (x) { return x !== t.id; }) : d.tags.concat([t.id]) }); } }, t.name || t.id);
          })),
          h('div', { className: 'em-inline' },
            h('input', { className: 'em-input', placeholder: tt('bulk.newTag'), onKeyDown: function (e) { if (e.key === 'Enter' && e.target.value.trim()) { addBulkTag(e.target.value.trim()); e.target.value = ''; } } }),
            h('span', { className: 'em-hint' }, '⏎')
          ),
          h('div', { className: 'em-hint' }, tt('bulk.tagsHint'))
        )
      ];
      return overlay(tt('bulk.title'), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('bulk.cancel')),
        h('button', { className: 'em-btn primary', onClick: bulkMetaApply }, tt('bulk.apply', { count: selectedCount() }))
      ]);
    }

    function overlay(title, body, foot) {
      return h('div', { className: 'em-overlay', onMouseDown: function (e) { if (e.target === e.currentTarget) setDialog(null); } },
        h('div', { className: 'em-dialog' },
          h('div', { className: 'em-dialog-head' }, title, h('button', { className: 'em-icon-btn', onClick: function () { setDialog(null); } }, Icon('close', 16))),
          h('div', { className: 'em-dialog-body' }, body),
          foot ? h('div', { className: 'em-dialog-foot' }, foot) : null
        ));
    }

    function renderMetaDialog() {
      var d = dialog.draft;
      var groups = (meta.groups || []);
      var tags = (meta.tags || []);
      function setDraft(patch) { setDialog(Object.assign({}, dialog, { draft: Object.assign({}, d, patch) })); }
      var body = [
        h('div', { className: 'em-field' }, h('span', null, tt('meta.group')),
          h('select', { className: 'em-select', value: d.group || '', onChange: function (e) { setDraft({ group: e.target.value || null }); } },
            h('option', { value: '' }, tt('meta.noGroup')),
            groups.map(function (g) { return h('option', { key: g.id, value: g.id }, g.name || g.id); })
          ),
          h('div', { className: 'em-inline' },
            h('input', { className: 'em-input', placeholder: tt('meta.newGroup'), onKeyDown: function (e) { if (e.key === 'Enter' && e.target.value.trim()) { addGroup(e.target.value.trim()); e.target.value = ''; } } }),
            h('span', { className: 'em-hint' }, '⏎')
          )
        ),
        h('div', { className: 'em-field' }, h('span', null, tt('meta.tags')),
          h('div', { className: 'em-chips' }, tags.map(function (t) {
            var on = d.tags.indexOf(t.id) !== -1;
            return h('button', { key: t.id, className: 'em-chip' + (on ? ' on' : ''), onClick: function () { setDraft({ tags: on ? d.tags.filter(function (x) { return x !== t.id; }) : d.tags.concat([t.id]) }); } }, t.name || t.id);
          })),
          h('div', { className: 'em-inline' },
            h('input', { className: 'em-input', placeholder: tt('meta.newTag'), onKeyDown: function (e) { if (e.key === 'Enter' && e.target.value.trim()) { addTag(e.target.value.trim()); e.target.value = ''; } } }),
            h('span', { className: 'em-hint' }, '⏎')
          )
        ),
        h('div', { className: 'em-field' }, h('span', null, tt('meta.note')), h('textarea', { className: 'em-textarea', value: d.note || '', onChange: function (e) { setDraft({ note: e.target.value }); } })),
        h(Checkbox, { checked: d.pinned === true, label: tt('meta.pinned'), onChange: function (v) { setDraft({ pinned: v }); } })
      ];
      return overlay(dialog.item.name, body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('meta.cancel')),
        h('button', { className: 'em-btn primary', onClick: applyMetaSave }, tt('meta.save')),
      ]);
    }

    function addGroup(name) {
      var id = 'g' + Date.now().toString(36);
      var next = JSON.parse(JSON.stringify(meta));
      next.groups = (next.groups || []).concat([{ id: id, name: name, color: null, order: (next.groups || []).length }]);
      saveMeta(next).then(function () {
        setDialog(function (cur) { return cur && cur.type === 'meta' ? Object.assign({}, cur, { draft: Object.assign({}, cur.draft, { group: id }) }) : cur; });
      });
    }

    function renameGroup(id, name) {
      if (!id || !name || !String(name).trim()) return;
      var next = JSON.parse(JSON.stringify(meta));
      (next.groups || []).forEach(function (g) { if (g.id === id) g.name = String(name).trim(); });
      saveMeta(next, tt('toast.saved'));
    }

    function addTag(name) {
      var id = 't' + Date.now().toString(36);
      var next = JSON.parse(JSON.stringify(meta));
      next.tags = (next.tags || []).concat([{ id: id, name: name, color: null }]);
      saveMeta(next).then(function () { setDialog(function (cur) { return cur && cur.type === 'meta' ? Object.assign({}, cur, { draft: Object.assign({}, cur.draft, { tags: cur.draft.tags.concat([id]) }) }) : cur; }); });
    }

    function renderValueDialog() {
      var d = dialog.draft;
      function setDraft(patch) { setDialog(Object.assign({}, dialog, { draft: Object.assign({}, d, patch) })); }
      var body = [
        d.isNew ? h('div', { className: 'em-field' }, h('span', null, tt('edit.name')), h('input', { className: 'em-input mono', value: d.name, onChange: function (e) { setDraft({ name: e.target.value }); } })) : null,
        h('div', { className: 'em-field' }, h('span', null, tt('edit.value')), h('textarea', { className: 'em-textarea mono', value: d.value, onChange: function (e) { setDraft({ value: e.target.value }); } })),
        h('div', { className: 'em-field' }, h('span', null, tt('edit.scope')),
          h('select', { className: 'em-select', value: d.scope, onChange: function (e) { setDraft({ scope: e.target.value }); } },
            h('option', { value: 'user' }, tt('edit.scope.user')),
            h('option', { value: 'machine' }, tt('edit.scope.machine'))
          )),
        h('div', { className: 'em-warn' }, tt('edit.warn')),
        (!d.isNew && dialog.item && dialog.item.protected) ? h('div', { className: 'em-warn' }, tt('edit.warnProtected')) : null
      ];
      var foot = [h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('edit.cancel'))];
      if (!d.isNew) foot.push(h('button', { className: 'em-btn danger', onClick: function () { deleteVar(dialog.item); } }, Icon('trash', 14), tt('edit.delete')));
      foot.push(h('button', { className: 'em-btn primary', onClick: applyValueSave }, tt('edit.save')));
      return overlay(d.isNew ? tt('edit.title.new') : tt('edit.title.edit'), body, foot);
    }

    function renderExportDialog() {
      var scopeState = dialog.exportSelected === true;
      var withState = dialog.exportWithValues === true;
      var count = scopeState ? selectedCount() : filtered.length;
      var body = [
        h('div', { className: 'em-field' }, h('span', null, tt('export.scope')),
          h('select', { className: 'em-select', value: scopeState ? 'selected' : 'all', onChange: function (e) { setDialog(Object.assign({}, dialog, { exportSelected: e.target.value === 'selected' })); } },
            h('option', { value: 'all' }, tt('export.scope.all') + ' (' + filtered.length + ')'),
            h('option', { value: 'selected', disabled: selectedCount() === 0 }, tt('export.scope.selected', { count: selectedCount() }))
          )),
        h('div', { className: 'em-statline' }, h('span', { className: 'em-stat' }, tt('export.count', { count: count }))),
        h(Checkbox, { checked: withState, label: tt('export.includeValues'), onChange: function (v) { setDialog(Object.assign({}, dialog, { exportWithValues: v })); } }),
        withState ? h('div', { className: 'em-warnbox' }, Icon('lock', 14), h('span', null, tt('export.warnValues'))) : null
      ];
      return overlay(tt('export.title'), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('export.cancel')),
        h('button', { className: 'em-btn primary', onClick: function () { doExport(scopeState, withState); } }, Icon('download', 14), tt('export.confirm')),
      ]);
    }

    function renderImportPick() {
      var body = [
        h('div', { className: 'em-upload' },
          h('div', { className: 'em-upload-icon' }, Icon('upload', 22)),
          h('div', { className: 'em-upload-title' }, tt('import.pick')),
          h('div', { className: 'em-hint' }, tt('import.draghint')),
          h('label', { className: 'em-file' },
            h('input', { type: 'file', accept: '.json,application/json', onChange: onImportFile }),
            h('span', { className: 'em-btn primary' }, Icon('upload', 14), tt('import.choose'))))
      ];
      return overlay(tt('import.title'), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('import.cancel'))
      ]);
    }

    function renderImportDialog() {
      var p = dialog.payload || {};
      var vars = Array.isArray(p.variables) ? p.variables : [];
      var g = p.meta && p.meta.groups ? p.meta.groups.length : 0;
      var tg = p.meta && p.meta.tags ? p.meta.tags.length : 0;
      var body = [
        h('div', { className: 'em-statline' },
          h('span', { className: 'em-stat' }, tt('import.statVars', { count: vars.length })),
          h('span', { className: 'em-stat' }, tt('import.statGroups', { count: g })),
          h('span', { className: 'em-stat' }, tt('import.statTags', { count: tg }))),
        h('div', { className: 'em-field' }, h('span', null, tt('import.mergeMode')),
          h('select', { className: 'em-select', value: dialog.mergeMode, onChange: function (e) { setDialog(Object.assign({}, dialog, { mergeMode: e.target.value })); } },
            h('option', { value: 'merge' }, tt('import.merge')),
            h('option', { value: 'replace' }, tt('import.replace'))
          )),
        h(Checkbox, { checked: dialog.writeValues === true, label: tt('import.writeValues'), onChange: function (v) { setDialog(Object.assign({}, dialog, { writeValues: v })); } }),
        dialog.writeValues === true ? h('div', { className: 'em-warnbox' }, Icon('lock', 14), h('span', null, tt('import.writeWarn'))) : null
      ];
      return overlay(tt('import.title'), body, [
        h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('import.cancel')),
        h('button', { className: 'em-btn primary', onClick: doImport }, Icon('check', 14), tt('import.confirm')),
      ]);
    }

    function renderBackups() {
      var list = dialog.items;
      var body;
      if (list === null) body = [h('div', { className: 'em-empty' }, tt('loading'))];
      else if (!list.length) body = [h('div', { className: 'em-empty' }, tt('backups.empty'))];
      else body = list.map(function (b) {
        return h('div', { key: b.backupId, className: 'em-list-line' },
          h('span', null, (b.existed ? '↺ ' : '− ') + b.name + '  ·  ' + b.scope + (b.kind ? ' · ' + b.kind : '')),
          h('span', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, h('span', { className: 'em-hint' }, b.ts ? String(b.ts).slice(0, 19).replace('T', ' ') : ''),
            h('button', { className: 'em-btn', onClick: function () { callApi('restoreBackup', { backupId: b.backupId }).then(function (r) { if (r && r.ok) { showToast(tt('toast.saved')); setDialog(null); load(); } else showToast(tt('toast.writeFailed', { msg: (r && r.message) || '' }), true); }); } }, tt('backups.restore')))
        );
      });
      return overlay(tt('backups.title'), body, [h('button', { className: 'em-btn', onClick: function () { setDialog(null); } }, tt('backups.close'))]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 插件入口                                                            */
  /* ------------------------------------------------------------------ */
  function registerShortcut(ctx) {
    var done = false;
    function attempt(shortcuts, source) {
      if (done || !shortcuts || typeof shortcuts.register !== 'function') return false;
      var binding = { code: 'KeyE', modifiers: ['primary', 'alt'] };
      var definition = {
        id: 'envhub.open',
        label: function () { return tt('shortcut.label'); },
        aliases: ['环境变量', '环境变量管理器', 'env', 'environment variables', 'env manager'],
        defaults: { 'desktop:macos': binding, 'desktop:windows': binding, 'web:macos': binding, 'web:windows': binding },
        regions: ['page', 'editable', 'terminal'],
        modals: [],
        resolve: function () {
          return {
            status: 'handled',
            run: function () {
              try {
                var layout = typeof ctx.get === 'function' ? ctx.get('layout') : undefined;
                if (layout && typeof layout.selectPanel === 'function') {
                  layout.selectPanel(panelVisible ? null : 'envhub');
                }
              } catch (error) { try { console.warn('[envhub] shortcut run failed:', error && error.message); } catch (ignored) { /* ignore */ } }
            },
          };
        },
      };
      try {
        var run = function () { return shortcuts.register(definition); };
        if (typeof ctx.effect === 'function') ctx.effect(run, 'envhub: shortcut'); else run();
        done = true;
        try { console.log('[envhub] shortcut registered: Ctrl+Alt+E (id=envhub.open) via ' + source); } catch (ignored) { /* ignore */ }
        return true;
      } catch (error) { try { console.warn('[envhub] shortcut register failed via ' + source + ':', error && error.message); } catch (ignored) { /* ignore */ } return false; }
    }
    try { var direct = typeof ctx.get === 'function' ? ctx.get('shortcuts') : undefined; if (attempt(direct, 'get')) return; } catch (ignored) { /* ignore */ }
    if (typeof ctx.inject !== 'function') return;
    try { ctx.inject(['shortcuts'], function (scope) { var s = (scope && scope.shortcuts) || (scope && typeof scope.get === 'function' ? scope.get('shortcuts') : undefined); attempt(s, 'inject'); }); } catch (ignored) { /* ignore */ }
  }

  function ensureStyles() {
    try {
      if (typeof document === 'undefined' || !document.head) return undefined;
      if (document.getElementById('envhub-style')) return undefined;
      var style = document.createElement('style');
      style.id = 'envhub-style';
      style.textContent = CSS;
      document.head.appendChild(style);
      return function dispose() { try { if (style.parentNode) style.parentNode.removeChild(style); } catch (ignored) { /* ignore */ } };
    } catch (ignored) { return undefined; }
  }

  return {
    inject: ['slots'],
    apply: function apply(ctx) {
      try {
        if (typeof ctx.effect === 'function') ctx.effect(ensureStyles, 'envhub: styles');
        else ensureStyles();

        try {
          if (typeof ctx.inject === 'function') {
            ctx.inject(['locale'], function (scope) {
              try {
                var locale = scope && (scope.locale || (typeof scope.get === 'function' ? scope.get('locale') : undefined));
                if (!locale || typeof locale.register !== 'function') return;
                var register = function () { return locale.register(NS, { zh: ZH, en: EN }); };
                if (typeof ctx.effect === 'function') ctx.effect(register, 'envhub: locale'); else register();
                if (typeof locale.bind === 'function') activeT = locale.bind(NS);
              } catch (error) { try { console.warn('[envhub] locale registration failed:', error && error.message); } catch (ignored) { /* ignore */ } }
            });
          }
        } catch (ignored) { /* ignore */ }

        if (typeof ctx.inject !== 'function') return;
        ctx.inject(['slots'], function (scope) {
          try {
            var slots = scope && scope.slots;
            if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
              try { console.warn('[envhub] slots scope incomplete; retry on next activation'); } catch (ignored) { /* ignore */ }
              return;
            }
            function safeRegister(slotName, factory) {
              try {
                slots.inject(slotName, function () {
                  try { return factory(); } catch (error) { try { console.error('[envhub] seat "' + slotName + '" failed:', error && (error.stack || error.message)); } catch (ignored) { /* ignore */ } return undefined; }
                });
              } catch (error) { try { console.error('[envhub] slots.inject("' + slotName + '") failed:', error && (error.stack || error.message)); } catch (ignored) { /* ignore */ } }
            }
            safeRegister('sidebar.panellist', function () {
              return slots.register({ name: 'sidebar.panellist', id: 'envhub', order: 40, locale: NS, label: function () { return tt('nav'); } }, SidebarIcon);
            });
            safeRegister('main', function () {
              return slots.register({ name: 'main', key: 'envhub' }, EnvManagerPanel);
            });
            try { console.log('[envhub] seats registered: sidebar.panellist + main'); } catch (ignored) { /* ignore */ }
          } catch (error) { try { console.error('[envhub] seat registration failed:', error && error.message); } catch (ignored) { /* ignore */ } }
        });
        registerShortcut(ctx);
      } catch (error) { try { console.error('[envhub] apply failed:', error && (error.stack || error.message)); } catch (ignored) { /* ignore */ } }
    },
  };
}
