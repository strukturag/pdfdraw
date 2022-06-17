<?php
declare(strict_types=1);
/**
 * @copyright Copyright (C) 2018, struktur AG
 *
 * @author Joachim Bauch <mail@joachim-bauch.de>
 *
 * @license AGPL-3.0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace OCA\Pdfdraw\Controller;

use \Firebase\JWT\JWT;
use \Firebase\JWT\Key;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Constants;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IConfig;
use OCP\IL10N;
use OCP\ILogger;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Security\ISecureRandom;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IManager;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Symfony\Component\EventDispatcher\GenericEvent;

class ViewerController extends Controller {

	const PDF_MIME_TYPES = [
		'application/pdf',
	];

	/** @var string */
	private $userId;

	/** @var IURLGenerator */
	private $urlGenerator;

	/** @var IRootFolder */
	private $root;

	/** @var L10N */
	private $l10n;

	/** @var ILogger */
	private $logger;

	/** @var IUserManager */
	private $userManager;

	/** @var IUserSession */
	private $userSession;

	/** @var ISession */
	private $session;

	/** @var IConfig */
	private $config;

	/** @var ISecureRandom */
	private $secureRandom;

	/** @var IManager */
	private $shareManager;

	/** @var EventDispatcherInterface */
	private $dispatcher;

	/**
	 * @param string $AppName
	 * @param IRequest $request
	 * @param $userId
	 * @param IRootFolder $root
	 * @param IL10N $l10n
	 * @param ILogger $logger
	 * @param IURLGenerator $urlGenerator
	 * @param IUserManager $userManager
	 * @param IUserSession $userSession
	 * @param ISession $session
	 * @param IConfig $config
	 * @param ISecureRandom $secureRandom
	 * @param IManager $shareManager
	 * @param EventDispatcherInterface $dispatcher
	 */
	public function __construct(
			string $AppName,
			IRequest $request,
			$UserId,
			IRootFolder $root,
			IL10N $l10n,
			ILogger $logger,
			IURLGenerator $urlGenerator,
			IUserManager $userManager,
			IUserSession $userSession,
			ISession $session,
			IConfig $config,
			ISecureRandom $secureRandom,
			IManager $shareManager,
			EventDispatcherInterface $dispatcher) {
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->root = $root;
		$this->l10n = $l10n;
		$this->logger = $logger;
		$this->urlGenerator = $urlGenerator;
		$this->userManager = $userManager;
		$this->userSession = $userSession;
		$this->session = $session;
		$this->config = $config;
		$this->secureRandom = $secureRandom;
		$this->shareManager =$shareManager;
		$this->dispatcher = $dispatcher;
	}

	/**
	 * Getting file by identifier
	 *
	 * @param integer $userId - user identifier
	 * @param integer $fileId - file identifier
	 *
	 * @return array
	 */
	private function getFile($userId, $fileId) {
		if (empty($fileId)) {
			return [NULL, $this->l10n->t("FileId is empty.")];
		}

		if ($userId !== NULL) {
			$files = $this->root->getUserFolder($userId)->getById($fileId);
		} else {
			$this->logger->debug("getFile by unknown user: " . $fileId, array("app" => $this->appName));
			$files = $this->root->getById($fileId);
		}

		if (empty($files)) {
			return [NULL, $this->l10n->t("File not found.")];
		}
		$file = $files[0];

		if (!$file->isReadable()) {
			return [NULL, $this->l10n->t("You do not have enough permissions to view the file.")];
		}
		return [$file, NULL];
	}

	private function getShare($token) {
		if (empty($token)) {
			return [NULL, $this->l10n->t("Token is empty.")];
		}

		$share;
		try {
			$share = $this->shareManager->getShareByToken($token);
		} catch (ShareNotFound $e) {
			$this->logger->error("getShare error: " . $e->getMessage(), array("app" => $this->appName));
			$share = NULL;
		}

		if ($share === NULL || $share === false) {
			return [NULL, $this->l10n->t("You do not have enough permissions to view the file.")];
		}

		if ($share->getPassword()
			&& (!$this->session->exists("public_link_authenticated")
				|| $this->session->get("public_link_authenticated") !== (string) $share->getId())) {
			return [NULL, $this->l10n->t("You do not have enough permissions to view the file.")];
		}

		return [$share, NULL];
	}

	private function getFileByToken($fileId, $token) {
		list ($share, $error) = $this->getShare($token);

		if (isset($error)) {
			return [NULL, $error];
		}

		if (($share->getPermissions() & Constants::PERMISSION_READ) === 0) {
			return [NULL, $this->l10n->t("You do not have enough permissions to view the file.")];
		}

		try {
			$node = $share->getNode();
		} catch (NotFoundException $e) {
			$this->logger->error("getFileByToken error: " . $e->getMessage(), array("app" => $this->appName));
			return [NULL, $this->l10n->t("File not found.")];
		}

		if ($node instanceof Folder) {
			$files = $node->getById($fileId);
			if (empty($files)) {
				return [NULL, $this->l10n->t("File not found.")];
			}
			$file = $files[0];
		} else {
			$file = $node;
		}

		return [$file, NULL];
	}

	private function getDownloadSecret(): string {
		$secret = $this->config->getAppValue('pdfdraw', 'download-token');
		if (empty($secret)) {
			$secret = $this->secureRandom->generate(32);
			$this->config->setAppValue('pdfdraw', 'download-token', $secret);
		}
		return $secret;
	}

	/**
	 * Generate secure link to download document
	 *
	 * @param integer $fileId - file identifier
	 * @param string $token - access token
	 *
	 * @return string
	 */
	private function getUrl($fileId, $token = NULL) {

		$user = $this->userSession->getUser();
		$userId = NULL;
		if (!empty($user)) {
			$userId = $user->getUID();
		}

		$secret = $this->getDownloadSecret();
		$data = [
			'iss' => $this->urlGenerator->getBaseUrl(),
			'sub' => $userId,
			'exp' => time() + (5 * 60),  // 5 minutes
			'fileId' => $fileId,
			'token' => $token,
		];
		$jwt = JWT::encode($data, $secret, 'HS256');

		$fileUrl = $this->urlGenerator->linkToRouteAbsolute($this->appName . ".viewer.downloadFile", ["token" => $jwt]);

		return $fileUrl;
	}

	private function isValidPdfFile($file) {
		$mime = $file->getMimeType();
		if ($mime) {
			$mime = strtolower($mime);
		}
		if (!in_array($mime, self::PDF_MIME_TYPES)) {
			return $this->l10n->t('File %s is not a PDF file (%s).', [$file->getName(), $mime]);
		}

		return null;
	}

	/**
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 *
	 * @return TemplateResponse|RedirectResponse
	 */
	public function index($fileId, $token = null) {
		if (empty($token) && !$this->userSession->isLoggedIn()) {
			$redirectUrl = $this->urlGenerator->linkToRoute("core.login.showLoginForm", [
				"redirect_url" => $this->request->getRequestUri()
			]);
			return new RedirectResponse($redirectUrl);
		}

		list($file, $error) = empty($token) ? $this->getFile($this->userId, $fileId) : $this->getFileByToken($fileId, $token);
		if (isset($error)) {
			$this->logger->error("index: " . $fileId . " " . $error, array("app" => $this->appName));
			return ['error' => $error];
		}

		$error = $this->isValidPdfFile($file);
		if (isset($error)) {
			$this->logger->error("index: " . $fileId . " " . $error, array("app" => $this->appName));
			return ['error' => $error];
		}

		$backend = $this->config->getAppValue('pdfdraw', 'backend');
		if (!empty($backend)) {
			$backend = json_decode($backend);
		}
		if (empty($backend) || empty($backend->server)) {
			return ['error' => $this->l10n->t('No backend configured.')];
		}

		$fileUrl = $this->getUrl($fileId, $token);
		$url = $this->urlGenerator->getBaseUrl() . '/apps/pdfdraw/viewer/' . $file->getId() . '?file=' . $fileUrl;
		if (!empty($token)) {
			$url = $url . '&token=' . $token;
		}
		$params = [
			'url' => $url,
		];
		$response = new TemplateResponse($this->appName, 'index', $params);
		$policy = new ContentSecurityPolicy();
		$policy->addAllowedFrameDomain('\'self\'');
		$response->setContentSecurityPolicy($policy);
		return $response;
	}

	/**
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 * @PublicPage
	 *
	 * @return TemplateResponse|RedirectResponse
	 */
	public function publicIndex($fileId, $token) {
		return $this->index($fileId, $token);
	}

	/**
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @return TemplateResponse|array
	 */
	public function viewer(string $fileId, $token = null) {
		list($file, $error) = empty($token) ? $this->getFile($this->userId, $fileId) : $this->getFileByToken($fileId, $token);
		if (isset($error)) {
			$this->logger->error("viewer: " . $fileId . " " . $error, array("app" => $this->appName));
			return ['error' => $error];
		}

		$error = $this->isValidPdfFile($file);
		if (isset($error)) {
			$this->logger->error("viewer: " . $fileId . " " . $error, array("app" => $this->appName));
			return ['error' => $error];
		}

		if (!empty($token)) {
			list ($share, $error) = $this->getShare($token);
			if (isset($error)) {
				return [NULL, $error];
			}

			$permissions = $share->getPermissions();
		} else {
			$permissions = $file->getPermissions();
		}
		$event = new GenericEvent($file, [
			'permissions' => $permissions,
			'token' => $token,
		]);
		$this->dispatcher->dispatch('OCA\\PdfDraw::getPermissions', $event);
		$permissions = $event->getArgument('permissions');

		$currentUser = $this->userManager->get($this->userId);
		$displayName= "";
		if ($currentUser instanceof IUser) {
			$displayName = $currentUser->getDisplayName();
		}
		$event = new GenericEvent($file, [
			'displayName' => $displayName,
			'token' => $token,
		]);
		$this->dispatcher->dispatch('OCA\\PdfDraw::getDisplayName', $event);
		$displayName = $event->getArgument('displayName');

		$backend = $this->config->getAppValue('pdfdraw', 'backend');
		$server = null;
		$url = null;
		$jwt = null;
		if (!empty($backend)) {
			$backend = json_decode($backend);
			$secret = $backend->secret;
			$server = $backend->server;
			$url = parse_url($server);
			$token = [
				'iss' => $this->urlGenerator->getBaseUrl(),
				'sub' => $this->userId,
				'exp' => time() + 86400,  // 24 hours
				'file' => $fileId,
				'filename' => $file->getName(),
				'displayname' => $displayName,
				'permissions' => $permissions,
			];
			$jwt = JWT::encode($token, $secret, 'HS256');
		}
		$params = [
			'urlGenerator' => $this->urlGenerator,
			'fileId' => $fileId,
			'userId' => $this->userId,
			'displayName' => $displayName,
			'server' => $server,
			'token' => $jwt,
			'permissions' => $permissions,
		];
		$response = new TemplateResponse($this->appName, 'viewer', $params, 'blank');
		$policy = new ContentSecurityPolicy();
		if (!empty($url)) {
			// Allow access to backend server.
			$host = $url['host'];
			if (!empty($url['port'])) {
				$host = $host . ':' . $url['port'];
			}
			$policy->addAllowedConnectDomain($url['scheme'] . '://' . $host);
			if ($url['scheme'] === 'http') {
				$policy->addAllowedConnectDomain('ws://' . $host);
			} else {
				$policy->addAllowedConnectDomain('wss://' . $host);
			}
		}
		$policy->addAllowedChildSrcDomain('\'self\'');
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedImageDomain('*');
		$policy->allowEvalScript(true);  // Required for paper.js
		$response->setContentSecurityPolicy($policy);
		return $response;
	}

	/**
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @return DataDisplayResponse
	 */
	public function downloadFile(string $token) {
		$secret = $this->getDownloadSecret();
		try {
			$key = new Key($secret, 'HS256');
			$data = JWT::decode($token, $key);
		} catch (\Exception $e) {
			$this->logger->logException($e, [
				'message' => 'download: ' . $token,
				'app' => $this->appName,
			]);
			return new JSONResponse(["message" => $this->l10n->t("Invalid token.")], Http::STATUS_FORBIDDEN);
		}

		if ($this->userSession->isLoggedIn()) {
			$userId = $this->userSession->getUser()->getUID();
		} else {
			$userId = $data->sub;
		}

		$token = isset($data->token) ? $data->token : null;
		list ($file, $error) = empty($token) ? $this->getFile($userId, $data->fileId) : $this->getFileByToken($data->fileId, $token);
		if (isset($error)) {
			$this->logger->error('Could not get file: ' . $error, ['app' => $this->appName]);
			return new JSONResponse(["message" => $error]);
		}

		if ($this->userSession->isLoggedIn() && !$file->isReadable()) {
			return new JSONResponse(["message" => $this->l10n->t("Access denied.")], Http::STATUS_FORBIDDEN);
		}

		return new DataDisplayResponse($file->getContent(), Http::STATUS_OK, [
			'Content-Type' => $file->getMimeType(),
		]);
	}

}
