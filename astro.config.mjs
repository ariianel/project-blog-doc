import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
	site: 'https://example.com',
	integrations: [
		starlight({
			title: 'WLKOM',
			description: 'A Linux kernel rootkit (LKM) + Flask C2 server — EPITA SYS2 2026',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ariianel/project-blog-doc' },
			],
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				fr: { label: 'Français', lang: 'fr' },
			},
			sidebar: [
				{
					label: 'Introduction',
					translations: { fr: 'Introduction' },
					link: '/',
				},
				{
					label: 'Architecture',
					translations: { fr: 'Architecture' },
					link: '/architecture',
				},
				{
					label: 'Setup',
					translations: { fr: 'Installation' },
					link: '/setup',
				},
				{
					label: 'C2 Server',
					translations: { fr: 'Serveur C2' },
					link: '/c2-server',
				},
				{
					label: 'Rootkit (LKM)',
					translations: { fr: 'Rootkit (LKM)' },
					items: [
						{ label: 'Overview', translations: { fr: 'Vue d\'ensemble' }, link: '/rootkit' },
						{ label: 'Connection & Polling', translations: { fr: 'Connexion & Polling' }, link: '/rootkit/connection' },
						{ label: 'Execute Commands', translations: { fr: 'Exécution de commandes' }, link: '/rootkit/exec' },
						{ label: 'Upload / Download', translations: { fr: 'Upload / Download' }, link: '/rootkit/upload-download' },
						{ label: 'Reverse Shell', translations: { fr: 'Reverse Shell' }, link: '/rootkit/reverse-shell' },
						{ label: 'Hide Module', translations: { fr: 'Cacher le module' }, link: '/rootkit/hide-module' },
						{ label: 'Hide Files', translations: { fr: 'Cacher les fichiers' }, link: '/rootkit/hide-files' },
						{ label: 'Hide Lines', translations: { fr: 'Cacher les lignes' }, link: '/rootkit/hide-lines' },
					],
				},
				{
					label: 'Design Choices',
					translations: { fr: 'Choix techniques' },
					link: '/choices',
				},
			],
		}),
	],
});
