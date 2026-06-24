import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
	site: 'https://example.com',
	integrations: [
		starlight({
			customCss: ['./src/styles/custom.css'],
			title: 'WLKOM',
			description: 'A Linux kernel rootkit (LKM) + Flask C2 server — EPITA SYS2 2026',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ariianel/project-blog-doc' },
			],
			sidebar: [
				{
					label: 'Get Started',
					link: '/setup',
				},
				{
					label: 'Architecture',
					link: '/architecture',
				},
				{
					label: 'C2 Server',
					link: '/c2-server',
				},
				{
					label: 'Rootkit (LKM)',
					items: [
						{ label: 'Overview', link: '/rootkit' },
						{ label: 'Connection & Polling', link: '/rootkit/connection' },
						{ label: 'Execute Commands', link: '/rootkit/exec' },
						{ label: 'Reverse Shell', link: '/rootkit/reverse-shell' },
						{ label: 'Encrypted Shell', link: '/rootkit/encrypted-shell' },
						{ label: 'Upload / Download', link: '/rootkit/upload-download' },
						{ label: 'Hide from Module List', link: '/rootkit/hide-module' },
						{ label: 'Hide Files & Directories', link: '/rootkit/hide-files' },
						{ label: 'Hide Lines from Files', link: '/rootkit/hide-lines' },
						{ label: 'Syscall Hooking', link: '/rootkit/syscall-hooking' },
					],
				},
			],
		}),
	],
});
