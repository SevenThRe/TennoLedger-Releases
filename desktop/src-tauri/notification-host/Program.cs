using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Toolkit.Uwp.Notifications;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("MyFrame")]
[assembly: AssemblyProduct("MyFrame")]
class NotificationHost
{
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool AllowSetForegroundWindow(uint processId);
    public class Request { public string id { get; set; } public string title { get; set; } public string body { get; set; } public bool silent { get; set; } }
    static readonly object OutputLock = new object();
    static void Emit(object value)
    {
        lock (OutputLock) { Console.WriteLine(new JavaScriptSerializer().Serialize(value)); Console.Out.Flush(); }
    }
    [STAThread]
    static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        var queue = new ConcurrentQueue<string>();
        var closed = new ManualResetEvent(false);
        try
        {
            uint parentPid = 0;
            if (args.Length == 2 && args[0] == "--parent-pid") uint.TryParse(args[1], out parentPid);
            ToastNotificationManagerCompat.OnActivated += e => {
                bool granted = parentPid != 0 && AllowSetForegroundWindow(parentPid);
                Emit(new { kind = "activated", foregroundGranted = granted, parentPid = parentPid });
            };
            // Initialize and retain Toolkit's own executable identity and COM activator.
            ToastNotificationManagerCompat.CreateToastNotifier();
            Emit(new { kind = "ready" });
            var reader = new Thread(() => {
                try { string line; while ((line = Console.ReadLine()) != null) queue.Enqueue(line); }
                finally { closed.Set(); }
            });
            reader.IsBackground = true;
            reader.Start();
            while (!closed.WaitOne(0) || !queue.IsEmpty)
            {
                string line;
                if (queue.TryDequeue(out line))
                {
                    Request request = null;
                    try
                    {
                        if (line.Length > 65536) throw new InvalidDataException("Notification too large");
                        request = new JavaScriptSerializer().Deserialize<Request>(line);
                        if (request == null || String.IsNullOrEmpty(request.id) || String.IsNullOrEmpty(request.title))
                            throw new InvalidDataException("Missing notification id/title");
                        var id = request.id;
                        new ToastContentBuilder().AddText(request.title).AddText(request.body ?? "")
                            .AddAudio(new ToastAudio { Silent = request.silent })
                            .AddArgument("action", "open-myframe")
                            .AddAppLogoOverride(new Uri(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "notification.png")))
                            .Show(toast => {
                                toast.Failed += (sender, e) => Emit(new { kind = "failed", id = id, error = e.ErrorCode.ToString() });
                            });
                        Emit(new { kind = "accepted", id = id });
                    }
                    catch (Exception ex) { Emit(new { kind = "failed", id = request == null ? "" : request.id, error = ex.ToString() }); }
                }
                Application.DoEvents();
                Thread.Sleep(20);
            }
            return 0;
        }
        catch (Exception ex) { Emit(new { kind = "fatal", error = ex.ToString() }); return 1; }
    }
}
