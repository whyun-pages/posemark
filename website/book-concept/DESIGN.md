---
name: Posemark 翻页概念稿
description: 以大幅产品截图为主体，保留翻页和书签的独立网页设计稿。
colors:
  primary: "#264a88"
  primary-deep: "#19396e"
  desk: "#ebe9e3"
  paper: "#faf9f4"
  ink: "#292f35"
  muted: "#626961"
  rule: "#dcdcd2"
typography:
  display:
    fontFamily: "BookDisplay, Georgia, serif"
    fontSize: "clamp(55px, 6.2vw, 86px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif"
    fontSize: "clamp(25px, 2.45vw, 35px)"
    fontWeight: 500
    lineHeight: 1.6
  body:
    fontFamily: "Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 2.1
rounded:
  button: "3px"
  book: "7px"
spacing:
  small: "8px"
  medium: "16px"
  large: "30px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.button}"
    padding: "12px 18px"
---

## Overview

**Creative North Star: "把写作，翻开。"**

本设计只适用于 book-concept 独立预览稿，尚未替代正式官网的视觉规范。用户指定书本翻页形式，并确认先制作网页版设计稿，因此直接用 HTML、CSS 与 JavaScript 呈现可操作的概念。

根据用户反馈，产品截图优先于书籍装饰。首页直接展示真实编辑器，功能截图贯穿整个跨页，标题与简短说明位于上方。蓝色用于品牌、下载按钮与当前书签；纸色底面、轻微书脊与页叠保留翻页形式。

## Colors

蓝色 #264a88 用于书名、主要操作和当前章节。桌面 #ebe9e3 与纸张 #faf9f4 区分书籍与环境。正文 #292f35、次要文字 #626961 和分隔线 #dcdcd2 承担内页信息层级。

## Typography

英文书名使用本地托管的 Cormorant Garamond，中文标题采用宋体字族，正文使用系统界面字体。书名为 55–86px，内页标题为 25–35px，手机标题为 29px；正文 12px、行高 2.1，功能标签至少 11px。字体许可见 assets/OFL.txt。

## Layout

桌面内容容器最大宽度 1500px，横向内边距 66px。概览与功能页上方以两列组织简短文案，下方截图跨越整组书页，1440px 视口下显示宽度约 1256px。720px 以下将文案顺序堆叠，截图保持完整并提供原图查看。下载页保留双页排版，手机只显示下载主体。书签、文档和下载入口保持可访问。

## Elevation & Depth

宽而柔的底部投影用于书籍离开桌面的深度。窄的零模糊页叠仅模拟实体书纸页的边缘，并非可复用的卡片阴影。书脊通过明暗渐变表达折痕；翻动的纸页有单独阴影。

## Shapes

书本轮廓接近矩形，仅外侧页角有小圆角。右侧书签有突出书边的形状。封面中心是由文字标记、直线和折角构成的几何图案，不依赖外部插画。

## Components

截图可点击打开原图查看器，支持关闭按钮和 Esc，手机可横向滚动查看原始细节。主交互为围绕书脊旋转的双面纸页，时长 850ms，曲线 cubic-bezier(.42,0,.18,1)。翻页中锁定重复输入，尊重减少动态效果的系统偏好。书签支持章节跳转，底部按钮与左右方向键支持顺序翻页；移动设备增加横向滑动，同时保留按钮。

功能展示页提供实际应用截图切换。下载页使用现有 GitHub Releases 地址和微软商店产品编号。外链新窗口打开时设置 noopener，按钮提供可见键盘焦点。

## Do's and Don'ts

继续使用真实截图和可验证的功能文案。后续扩展内容应作为新的跨页，不增加第三个并列书页。尚未实现语言切换，本稿只提供中文；正式替换官网前需要恢复现有中英双语能力。
