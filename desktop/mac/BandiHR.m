#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString *const BandiHRScheme = @"bandihr";

@interface AppSchemeHandler : NSObject <WKURLSchemeHandler>
@property(copy, nonatomic) NSString *rootPath;
@end

@implementation AppSchemeHandler

- (NSString *)mimeTypeForExtension:(NSString *)extension {
  NSDictionary<NSString *, NSString *> *types = @{
    @"css": @"text/css",
    @"html": @"text/html; charset=utf-8",
    @"js": @"text/javascript; charset=utf-8",
    @"json": @"application/json; charset=utf-8",
    @"png": @"image/png",
    @"jpg": @"image/jpeg",
    @"jpeg": @"image/jpeg",
    @"svg": @"image/svg+xml",
    @"webp": @"image/webp",
    @"woff": @"font/woff",
    @"woff2": @"font/woff2"
  };
  return types[extension.lowercaseString] ?: @"application/octet-stream";
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
  (void)webView;

  NSString *relativePath = urlSchemeTask.request.URL.path ?: @"/";
  while ([relativePath hasPrefix:@"/"]) {
    relativePath = [relativePath substringFromIndex:1];
  }
  if (relativePath.length == 0) {
    relativePath = @"index.html";
  }

  NSString *fullPath = [[self.rootPath stringByAppendingPathComponent:relativePath] stringByStandardizingPath];
  if (![fullPath hasPrefix:self.rootPath]) {
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:urlSchemeTask.request.URL
                                                              statusCode:403
                                                             HTTPVersion:@"HTTP/1.1"
                                                            headerFields:@{@"Content-Type": @"text/plain; charset=utf-8"}];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:[@"Forbidden" dataUsingEncoding:NSUTF8StringEncoding]];
    [urlSchemeTask didFinish];
    return;
  }

  NSData *data = [NSData dataWithContentsOfFile:fullPath];
  if (!data) {
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:urlSchemeTask.request.URL
                                                              statusCode:404
                                                             HTTPVersion:@"HTTP/1.1"
                                                            headerFields:@{@"Content-Type": @"text/plain; charset=utf-8"}];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:[@"Not Found" dataUsingEncoding:NSUTF8StringEncoding]];
    [urlSchemeTask didFinish];
    return;
  }

  NSString *mimeType = [self mimeTypeForExtension:fullPath.pathExtension];
  NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:urlSchemeTask.request.URL
                                                            statusCode:200
                                                           HTTPVersion:@"HTTP/1.1"
                                                          headerFields:@{@"Content-Type": mimeType}];
  [urlSchemeTask didReceiveResponse:response];
  [urlSchemeTask didReceiveData:data];
  [urlSchemeTask didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
  (void)webView;
  (void)urlSchemeTask;
}

@end

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate>
@property(strong, nonatomic) NSWindow *window;
@property(strong, nonatomic) AppSchemeHandler *schemeHandler;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification;

  NSRect frame = NSMakeRect(0, 0, 1440, 960);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                            styleMask:(NSWindowStyleMaskTitled |
                                                       NSWindowStyleMaskClosable |
                                                       NSWindowStyleMaskMiniaturizable |
                                                       NSWindowStyleMaskResizable)
                                              backing:NSBackingStoreBuffered
                                                defer:NO];

  self.window.title = @"BandiHR";
  self.window.minSize = NSMakeSize(1100, 740);
  [self.window center];

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  self.schemeHandler = [[AppSchemeHandler alloc] init];
  NSString *devURLString = NSProcessInfo.processInfo.environment[@"BANDIHR_DEV_URL"];
  if (devURLString.length == 0) {
    NSString *webRoot = [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"web"];
    self.schemeHandler.rootPath = webRoot.stringByStandardizingPath;
    [configuration setURLSchemeHandler:self.schemeHandler forURLScheme:BandiHRScheme];
  }

  WKWebView *webView = [[WKWebView alloc] initWithFrame:frame configuration:configuration];
  webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  webView.allowsBackForwardNavigationGestures = YES;
  webView.navigationDelegate = self;
  [self.window setContentView:webView];

  if (devURLString.length > 0) {
    NSURL *devURL = [NSURL URLWithString:devURLString];
    [webView loadRequest:[NSURLRequest requestWithURL:devURL]];
  } else {
    NSString *startURLString = [NSString stringWithFormat:@"%@://app/index.html", BandiHRScheme];
    [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:startURLString]]];
  }

  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  (void)sender;
  return YES;
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  (void)webView;
  (void)navigation;
  NSLog(@"Failed provisional navigation: %@", error);
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  (void)webView;
  (void)navigation;
  NSLog(@"Failed navigation: %@", error);
}

@end

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;

  @autoreleasepool {
    NSApplication *app = NSApplication.sharedApplication;
    AppDelegate *delegate = [[AppDelegate alloc] init];

    [app setActivationPolicy:NSApplicationActivationPolicyRegular];
    [app setDelegate:delegate];
    [app run];
  }

  return 0;
}
